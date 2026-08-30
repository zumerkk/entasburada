import "server-only";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { loadCustomerCart, type CartItem } from "./cart-repository";
import type { CustomerAccount } from "./customer-auth";

export type OrderTemplateFrequency = "ON_DEMAND" | "WEEKLY" | "MONTHLY";

export interface OrderTemplate {
  id: string;
  customerId: string;
  companyName: string;
  name: string;
  frequency: OrderTemplateFrequency;
  items: CartItem[];
  lastUsedAt?: string;
  createdAt: string;
  updatedAt: string;
}

const rootDir = findWorkspaceRoot(process.cwd());
const dataDir = path.join(rootDir, "data");
const filePath = path.join(dataDir, "order-templates.json");
let mutationQueue: Promise<void> = Promise.resolve();

export async function listOrderTemplates(customer: CustomerAccount): Promise<OrderTemplate[]> {
  const templates = await readAll();
  return templates
    .filter((template) => template.customerId === customer.id || normalize(template.companyName) === normalize(customer.companyName))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function saveCartAsTemplate(customer: CustomerAccount, name: string, frequency: OrderTemplateFrequency): Promise<OrderTemplate> {
  return mutate(async () => {
    const [templates, cart] = await Promise.all([readAll(), loadCustomerCart(customer)]);
    if (cart.items.length === 0) throw new Error("Boş sepet şablon olarak kaydedilemez.");
    const cleanName = name.trim().slice(0, 120);
    if (cleanName.length < 2) throw new Error("Şablon adı zorunludur.");
    const now = new Date().toISOString();
    const existingIndex = templates.findIndex((template) => template.customerId === customer.id && normalize(template.name) === normalize(cleanName));
    const template: OrderTemplate = {
      id: existingIndex >= 0 ? templates[existingIndex]!.id : `template-${randomUUID()}`,
      customerId: customer.id,
      companyName: customer.companyName,
      name: cleanName,
      frequency,
      items: cart.items.map((item) => ({ ...item })),
      createdAt: existingIndex >= 0 ? templates[existingIndex]!.createdAt : now,
      updatedAt: now
    };
    if (existingIndex >= 0) templates[existingIndex] = template;
    else templates.unshift(template);
    await saveAll(templates);
    return template;
  });
}

export function markTemplateUsed(customer: CustomerAccount, templateId: string): Promise<OrderTemplate> {
  return mutate(async () => {
    const templates = await readAll();
    const index = templates.findIndex((template) => template.id === templateId && (template.customerId === customer.id || normalize(template.companyName) === normalize(customer.companyName)));
    if (index < 0) throw new Error("Sipariş şablonu bulunamadı.");
    const now = new Date().toISOString();
    templates[index] = { ...templates[index]!, lastUsedAt: now, updatedAt: now };
    await saveAll(templates);
    return templates[index]!;
  });
}

export function deleteOrderTemplate(customer: CustomerAccount, templateId: string): Promise<void> {
  return mutate(async () => {
    const templates = await readAll();
    const next = templates.filter((template) => !(template.id === templateId && (template.customerId === customer.id || normalize(template.companyName) === normalize(customer.companyName))));
    if (next.length === templates.length) throw new Error("Sipariş şablonu bulunamadı.");
    await saveAll(next);
  });
}

async function readAll(): Promise<OrderTemplate[]> {
  try { return JSON.parse(await readFile(filePath, "utf8")) as OrderTemplate[]; } catch { return []; }
}
async function saveAll(rows: OrderTemplate[]) {
  await mkdir(dataDir, { recursive: true, mode: 0o700 });
  const tmpPath = `${filePath}.${process.pid}.${randomUUID()}.tmp`;
  await writeFile(tmpPath, `${JSON.stringify(rows, null, 2)}\n`, { mode: 0o600 });
  await rename(tmpPath, filePath);
}
function mutate<T>(operation: () => Promise<T>): Promise<T> {
  const result = mutationQueue.then(operation, operation);
  mutationQueue = result.then(() => undefined, () => undefined);
  return result;
}
function normalize(value: string) { return value.trim().toLocaleLowerCase("tr-TR"); }
function findWorkspaceRoot(startDir: string) {
  let current = startDir;
  while (current !== path.dirname(current)) {
    if (existsSync(path.join(current, "pnpm-workspace.yaml"))) return current;
    current = path.dirname(current);
  }
  return startDir;
}
