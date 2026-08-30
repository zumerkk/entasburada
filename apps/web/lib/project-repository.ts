import "server-only";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { searchCatalogRecords, type CatalogProductRecord } from "@entas/catalog";
import { loadCatalogStore } from "./catalog-repository";
import type { CustomerAccount } from "./customer-auth";
import type { MaterialListRow } from "./material-list-parser";

export type CustomerProjectStatus = "PLANNING" | "QUOTED" | "ORDERED" | "COMPLETED" | "ARCHIVED";
export type ProjectMatchStatus = "EXACT" | "SUGGESTED" | "UNMATCHED";

export interface ProjectProductMatch {
  sku: string;
  productName: string;
  productSlug: string;
  brand: string;
  category: string;
  stockStatus: string;
}

export interface CustomerProjectItem {
  id: string;
  requestedSku: string;
  requestedName: string;
  quantity: number;
  unit: string;
  targetPrice: string;
  note: string;
  matchStatus: ProjectMatchStatus;
  selectedMatch?: ProjectProductMatch;
  alternatives: ProjectProductMatch[];
}

export interface CustomerProject {
  id: string;
  customerId: string;
  companyName: string;
  name: string;
  code: string;
  jobsite: string;
  deliveryAddress: string;
  desiredDeliveryDate: string;
  note: string;
  status: CustomerProjectStatus;
  items: CustomerProjectItem[];
  quoteTrackingCodes: string[];
  createdAt: string;
  updatedAt: string;
}

const rootDir = findWorkspaceRoot(process.cwd());
const dataDir = path.join(rootDir, "data");
const projectsPath = path.join(dataDir, "customer-projects.json");
let mutationQueue: Promise<void> = Promise.resolve();

export async function listCustomerProjects(customer: CustomerAccount): Promise<CustomerProject[]> {
  const rows = await loadProjects();
  return rows
    .filter((project) => project.customerId === customer.id || normalize(project.companyName) === normalize(customer.companyName))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function getCustomerProject(customer: CustomerAccount, id: string): Promise<CustomerProject | null> {
  const projects = await listCustomerProjects(customer);
  return projects.find((project) => project.id === id) ?? null;
}

export function createCustomerProject(
  customer: CustomerAccount,
  input: Pick<CustomerProject, "name" | "code" | "jobsite" | "deliveryAddress" | "desiredDeliveryDate" | "note"> & { items: MaterialListRow[] }
): Promise<CustomerProject> {
  return mutate(() => createCustomerProjectUnlocked(customer, input));
}

async function createCustomerProjectUnlocked(
  customer: CustomerAccount,
  input: Pick<CustomerProject, "name" | "code" | "jobsite" | "deliveryAddress" | "desiredDeliveryDate" | "note"> & { items: MaterialListRow[] }
): Promise<CustomerProject> {
  const name = clean(input.name).slice(0, 180);
  if (name.length < 2) throw new Error("Proje veya şantiye adı zorunludur.");
  if (input.items.length === 0) throw new Error("En az bir malzeme satırı ekleyin veya dosya yükleyin.");
  const [projects, store] = await Promise.all([loadProjects(), loadCatalogStore()]);
  const now = new Date().toISOString();
  const project: CustomerProject = {
    id: `project-${randomUUID()}`,
    customerId: customer.id,
    companyName: customer.companyName,
    name,
    code: clean(input.code).slice(0, 80) || `PRJ-${String(projects.length + 1).padStart(4, "0")}`,
    jobsite: clean(input.jobsite).slice(0, 240),
    deliveryAddress: clean(input.deliveryAddress).slice(0, 600) || customer.deliveryAddress,
    desiredDeliveryDate: clean(input.desiredDeliveryDate).slice(0, 10),
    note: clean(input.note).slice(0, 2_000),
    status: "PLANNING",
    items: input.items.slice(0, 1_000).map((item) => matchMaterialRow(item, store.products)),
    quoteTrackingCodes: [],
    createdAt: now,
    updatedAt: now
  };
  await saveProjects([project, ...projects]);
  return project;
}

export function selectProjectItemMatch(customer: CustomerAccount, projectId: string, itemId: string, productSlug: string): Promise<CustomerProject> {
  return mutate(async () => {
    const [projects, store] = await Promise.all([loadProjects(), loadCatalogStore()]);
    const projectIndex = projects.findIndex((project) => project.id === projectId && (project.customerId === customer.id || normalize(project.companyName) === normalize(customer.companyName)));
    if (projectIndex < 0) throw new Error("Proje bulunamadı.");
    const project = projects[projectIndex]!;
    const itemIndex = project.items.findIndex((item) => item.id === itemId);
    const product = store.products.find((entry) => entry.slug === productSlug && entry.status === "ACTIVE" && entry.isVisible);
    if (itemIndex < 0 || !product) throw new Error("Malzeme veya ürün eşleşmesi bulunamadı.");
    project.items[itemIndex] = {
      ...project.items[itemIndex]!,
      matchStatus: "SUGGESTED",
      selectedMatch: toMatch(product)
    };
    project.updatedAt = new Date().toISOString();
    projects[projectIndex] = project;
    await saveProjects(projects);
    return project;
  });
}

export function linkProjectQuote(customer: CustomerAccount, projectId: string, trackingCode: string): Promise<CustomerProject> {
  return mutate(async () => {
    const projects = await loadProjects();
    const index = projects.findIndex((project) => project.id === projectId && (project.customerId === customer.id || normalize(project.companyName) === normalize(customer.companyName)));
    if (index < 0) throw new Error("Proje bulunamadı.");
    const project = projects[index]!;
    const quoteTrackingCodes = Array.from(new Set([trackingCode, ...project.quoteTrackingCodes]));
    const next = { ...project, quoteTrackingCodes, status: "QUOTED" as const, updatedAt: new Date().toISOString() };
    projects[index] = next;
    await saveProjects(projects);
    return next;
  });
}

export function deleteCustomerProject(customer: CustomerAccount, projectId: string): Promise<void> {
  return mutate(async () => {
    const projects = await loadProjects();
    const next = projects.filter((project) => !(project.id === projectId && (project.customerId === customer.id || normalize(project.companyName) === normalize(customer.companyName))));
    if (next.length === projects.length) throw new Error("Proje bulunamadı.");
    await saveProjects(next);
  });
}

function matchMaterialRow(row: MaterialListRow, products: CatalogProductRecord[]): CustomerProjectItem {
  const eligible = products.filter((product) => product.status === "ACTIVE" && product.isVisible);
  const requestedSku = clean(row.sku);
  const requestedName = clean(row.productName);
  const normalizedSku = normalize(requestedSku);
  const exact = normalizedSku
    ? eligible.find((product) => [product.sku, product.barcode ?? "", product.manufacturerCode ?? ""].some((value) => normalize(value) === normalizedSku))
    : undefined;
  const store = { version: 1 as const, updatedAt: "", products: eligible, importSummary: emptySummary() };
  const suggestions = exact
    ? [exact]
    : searchCatalogRecords(store, { q: requestedName || requestedSku, publicOnly: true, limit: 4 }).items;
  const alternatives = suggestions.map(toMatch);
  const selected = exact ? toMatch(exact) : alternatives[0];

  return {
    id: `project-item-${randomUUID()}`,
    requestedSku,
    requestedName,
    quantity: Math.min(999_999, Math.max(1, Math.trunc(Number(row.quantity) || 1))),
    unit: clean(row.unit) || exact?.unitType || "Adet",
    targetPrice: clean(row.targetPrice),
    note: clean(row.note).slice(0, 500),
    matchStatus: exact ? "EXACT" : selected ? "SUGGESTED" : "UNMATCHED",
    ...(selected ? { selectedMatch: selected } : {}),
    alternatives
  };
}

function toMatch(product: CatalogProductRecord): ProjectProductMatch {
  return {
    sku: product.sku,
    productName: product.name,
    productSlug: product.slug,
    brand: product.brand,
    category: product.catalogClassification?.categoryLabel ?? product.category,
    stockStatus: product.stockStatus
  };
}

function emptySummary() {
  return { importedRows: 0, active: 0, draft: 0, passive: 0, inStock: 0, lowStock: 0, incoming: 0, outOfStock: 0, priced: 0, zeroPrice: 0, sources: {} };
}

async function loadProjects(): Promise<CustomerProject[]> {
  try {
    return JSON.parse(await readFile(projectsPath, "utf8")) as CustomerProject[];
  } catch {
    return [];
  }
}

async function saveProjects(projects: CustomerProject[]): Promise<void> {
  await mkdir(dataDir, { recursive: true, mode: 0o700 });
  const tmpPath = `${projectsPath}.${process.pid}.${randomUUID()}.tmp`;
  await writeFile(tmpPath, `${JSON.stringify(projects, null, 2)}\n`, { mode: 0o600 });
  await rename(tmpPath, projectsPath);
}

function mutate<T>(operation: () => Promise<T>): Promise<T> {
  const result = mutationQueue.then(operation, operation);
  mutationQueue = result.then(() => undefined, () => undefined);
  return result;
}

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalize(value: string): string {
  return clean(value).toLocaleLowerCase("tr-TR").replace(/[ç]/g, "c").replace(/[ğ]/g, "g").replace(/[ı]/g, "i").replace(/[ö]/g, "o").replace(/[ş]/g, "s").replace(/[ü]/g, "u");
}

function findWorkspaceRoot(startDir: string): string {
  let current = startDir;
  while (current !== path.dirname(current)) {
    if (existsSync(path.join(current, "pnpm-workspace.yaml"))) return current;
    current = path.dirname(current);
  }
  return startDir;
}
