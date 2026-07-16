import "server-only";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { loadPricedCart } from "./cart-repository";
import { formatCatalogMoney, loadCatalogStore } from "./catalog-repository";
import { getCustomers, type CustomerAccount } from "./customer-auth";

export type UserEventType = "product_view" | "category_view" | "search" | "cart_add" | "cart_remove" | "cart_clear" | "favorite" | "quote_intent" | "order_create";

export interface UserEvent {
  id: string;
  type: UserEventType;
  occurredAt: string;
  customerId?: string | undefined;
  companyId?: string | undefined;
  companyName?: string | undefined;
  userName?: string | undefined;
  customerSegment?: string | undefined;
  accountManager?: string | undefined;
  sessionId?: string | undefined;
  productId?: string | undefined;
  productSlug?: string | undefined;
  productName?: string | undefined;
  sku?: string | undefined;
  brand?: string | undefined;
  category?: string | undefined;
  quantity?: number | undefined;
  unit?: string | undefined;
  unitPrice?: string | undefined;
  cartTotal?: string | undefined;
  searchTerm?: string | undefined;
  resultCount?: number | undefined;
  successful?: boolean | undefined;
  durationSeconds?: number | undefined;
  device?: string | undefined;
  ip?: string | undefined;
  referrer?: string | undefined;
  metadata?: Record<string, string | number | boolean | null> | undefined;
}

export interface EventRequestMeta {
  sessionId?: string | undefined;
  device?: string | undefined;
  ip?: string | undefined;
  referrer?: string | undefined;
}

export interface CustomerBehaviorRow {
  customerId: string;
  companyName: string;
  userName: string;
  segment: string;
  accountManager: string;
  topProduct: string;
  topCategory: string;
  lastVisitAt: string;
  productViewCount: number;
  abandonedItemCount: number;
  abandonedCartTotal: string;
  actionStatus: string;
  aiSummary: string;
}

export interface ProductInterestRow {
  sku: string;
  productName: string;
  brand: string;
  category: string;
  viewCount: number;
  uniqueCompanyCount: number;
  cartAddCount: number;
  quoteIntentCount: number;
  orderCount: number;
  conversionRate: string;
  stockStatus: string;
  interestedCompanies: string[];
  opportunityScore: number;
}

export interface AbandonedCartRow {
  customerId: string;
  companyName: string;
  userName: string;
  phone: string;
  segment: string;
  cartTotal: string;
  itemCount: number;
  highestValueProduct: string;
  lastActivityAt: string;
  ageLabel: string;
  accountManager: string;
  followUpStatus: string;
  whatsappDraft: string;
  whatsappHref: string;
}

export interface SearchMissRow {
  term: string;
  searchCount: number;
  resultCount: number;
  companyCount: number;
  lastSearchedAt: string;
  suggestedCategory: string;
  purchaseOpportunity: string;
}

export interface SalesOpportunity {
  id: string;
  createdAt: string;
  createdBy: string;
  customerId: string;
  companyName: string;
  title: string;
  source: string;
  score: number;
  status: "open" | "quoted" | "won" | "lost";
  note: string;
}

export interface SalesTask {
  id: string;
  createdAt: string;
  createdBy: string;
  customerId: string;
  companyName: string;
  assignee: string;
  dueAt: string;
  title: string;
  status: "open" | "done";
  note: string;
}

export interface SalesOpportunityInput {
  customerId?: string | undefined;
  companyName?: string | undefined;
  title?: string | undefined;
  source?: string | undefined;
  score?: number | undefined;
  note?: string | undefined;
}

export interface SalesTaskInput {
  customerId?: string | undefined;
  companyName?: string | undefined;
  assignee?: string | undefined;
  dueAt?: string | undefined;
  title?: string | undefined;
  note?: string | undefined;
}

const rootDir = findWorkspaceRoot(process.cwd());
const dataDir = path.join(rootDir, "data");
const eventsPath = path.join(dataDir, "user-events.json");
const opportunitiesPath = path.join(dataDir, "sales-opportunities.json");
const tasksPath = path.join(dataDir, "sales-tasks.json");

export async function trackUserEvent(input: Omit<UserEvent, "id" | "occurredAt"> & { occurredAt?: string }): Promise<UserEvent> {
  const events = await loadUserEvents();
  const event = stripUndefined({
    ...input,
    id: `evt-${randomUUID()}`,
    occurredAt: input.occurredAt ?? new Date().toISOString()
  }) as UserEvent;
  await writeJson(eventsPath, [event, ...events].slice(0, 5000));
  return event;
}

export async function trackProductViewEvent(
  customer: CustomerAccount | null,
  product: Pick<UserEvent, "productId" | "productSlug" | "productName" | "sku" | "brand" | "category" | "durationSeconds">,
  meta: EventRequestMeta = {}
): Promise<UserEvent> {
  return trackUserEvent(withCustomer(customer, { ...product, ...meta, type: "product_view" }));
}

export async function trackCategoryViewEvent(customer: CustomerAccount | null, category: string, meta: EventRequestMeta = {}): Promise<UserEvent> {
  return trackUserEvent(withCustomer(customer, { type: "category_view", category, ...meta }));
}

export async function trackSearchEvent(
  customer: CustomerAccount | null,
  input: { searchTerm: string; resultCount: number; category?: string; brand?: string },
  meta: EventRequestMeta = {}
): Promise<UserEvent> {
  return trackUserEvent(
    withCustomer(customer, {
      type: "search",
      searchTerm: input.searchTerm,
      resultCount: input.resultCount,
      successful: input.resultCount > 0,
      category: input.category,
      brand: input.brand,
      ...meta
    })
  );
}

export async function trackCartEvent(
  customer: CustomerAccount,
  type: "cart_add" | "cart_remove" | "cart_clear" | "quote_intent" | "order_create",
  input: Pick<UserEvent, "productName" | "sku" | "brand" | "category" | "quantity" | "unit" | "cartTotal"> = {},
  meta: EventRequestMeta = {}
): Promise<UserEvent> {
  return trackUserEvent(withCustomer(customer, { ...input, ...meta, type }));
}

export async function loadUserEvents(): Promise<UserEvent[]> {
  await ensureEventFile();
  return readJson<UserEvent[]>(eventsPath, []);
}

export async function getCustomerBehaviorReport(): Promise<{ generatedAt: string; rows: CustomerBehaviorRow[]; totals: { eventCount: number; activeCustomerCount: number; hotOpportunityCount: number } }> {
  const [customers, events] = await Promise.all([getCustomers(), loadUserEvents()]);
  const rows = await Promise.all(customers.filter((customer) => customer.status === "approved").map((customer) => toCustomerBehaviorRow(customer, events)));
  const activeRows = rows.sort((a, b) => Date.parse(b.lastVisitAt || "1970-01-01") - Date.parse(a.lastVisitAt || "1970-01-01"));

  return {
    generatedAt: new Date().toISOString(),
    rows: activeRows,
    totals: {
      eventCount: events.length,
      activeCustomerCount: activeRows.filter((row) => row.productViewCount > 0 || row.abandonedItemCount > 0).length,
      hotOpportunityCount: activeRows.filter((row) => row.actionStatus !== "Normal takip").length
    }
  };
}

export async function getProductInterestReport(): Promise<{ generatedAt: string; rows: ProductInterestRow[] }> {
  const [events, store] = await Promise.all([loadUserEvents(), loadCatalogStore()]);
  const grouped = new Map<string, UserEvent[]>();

  for (const event of events) {
    if (!event.sku && !event.productName) {
      continue;
    }

    const key = event.sku || event.productName || "unknown";
    grouped.set(key, [...(grouped.get(key) ?? []), event]);
  }

  const rows = Array.from(grouped.entries()).map(([key, itemEvents]) => {
    const first = itemEvents.find((event) => event.productName || event.sku) ?? itemEvents[0]!;
    const product = store.products.find((item) => item.sku === first.sku || item.name === first.productName);
    const uniqueCompanies = new Set(itemEvents.map((event) => event.companyName ?? event.customerId ?? event.sessionId ?? "anon"));
    const viewCount = countType(itemEvents, "product_view");
    const cartAddCount = countType(itemEvents, "cart_add");
    const quoteIntentCount = countType(itemEvents, "quote_intent");
    const orderCount = countType(itemEvents, "order_create");
    const opportunityScore = viewCount + cartAddCount * 10 + quoteIntentCount * 12 + itemEvents.filter((event) => (event.durationSeconds ?? 0) >= 30).length * 2;

    return {
      sku: first.sku ?? key,
      productName: first.productName ?? product?.name ?? key,
      brand: first.brand ?? product?.brand ?? "-",
      category: first.category ?? product?.category ?? "-",
      viewCount,
      uniqueCompanyCount: uniqueCompanies.size,
      cartAddCount,
      quoteIntentCount,
      orderCount,
      conversionRate: cartAddCount + quoteIntentCount === 0 ? "0%" : `${Math.round((orderCount / Math.max(1, cartAddCount + quoteIntentCount)) * 100)}%`,
      stockStatus: product?.stockStatus ?? "-",
      interestedCompanies: Array.from(new Set(itemEvents.map((event) => event.companyName).filter(Boolean))).slice(0, 4) as string[],
      opportunityScore
    };
  });

  return { generatedAt: new Date().toISOString(), rows: rows.sort((a, b) => b.opportunityScore - a.opportunityScore).slice(0, 100) };
}

export async function getAbandonedCartsReport(): Promise<{ generatedAt: string; rows: AbandonedCartRow[] }> {
  const [customers, events] = await Promise.all([getCustomers(), loadUserEvents()]);
  const rows = await Promise.all(
    customers
      .filter((customer) => customer.status === "approved")
      .map(async (customer) => {
        const cart = await loadPricedCart(customer);
        if (cart.items.length === 0) {
          return null;
        }

        const customerEvents = events.filter((event) => event.customerId === customer.id);
        const lastActivityAt = mostRecent(customerEvents)?.occurredAt ?? cart.updatedAt;
        const highestValueProduct = [...cart.items].sort((a, b) => Number(b.lineTotal) - Number(a.lineTotal))[0]?.productName ?? "-";
        return {
          customerId: customer.id,
          companyName: customer.companyName,
          userName: customer.authorizedPerson,
          phone: customer.phone,
          segment: customer.segment,
          cartTotal: cart.displayTotal,
          itemCount: cart.items.length,
          highestValueProduct,
          lastActivityAt,
          ageLabel: formatAge(lastActivityAt),
          accountManager: customer.accountManager ?? "Satış Operasyon",
          followUpStatus: "Takip bekliyor",
          whatsappDraft: `${customer.authorizedPerson} merhaba, sepetinizdeki ${highestValueProduct} ve diğer ürünler için bayi teklifinizi hazırlayabiliriz.`,
          whatsappHref: buildWhatsappHref(
            customer.phone,
            `${customer.authorizedPerson} merhaba, sepetinizdeki ${highestValueProduct} ve diğer ürünler için bayi teklifinizi hazırlayabiliriz.`
          )
        } satisfies AbandonedCartRow;
      })
  );

  const filteredRows = rows.filter((row): row is NonNullable<typeof row> => row !== null);
  return { generatedAt: new Date().toISOString(), rows: filteredRows };
}

export async function getSearchMissesReport(): Promise<{ generatedAt: string; rows: SearchMissRow[] }> {
  const events = (await loadUserEvents()).filter((event) => event.type === "search" && (event.resultCount ?? 0) === 0 && event.searchTerm);
  const grouped = new Map<string, UserEvent[]>();

  for (const event of events) {
    const key = normalize(event.searchTerm ?? "");
    if (!key) {
      continue;
    }
    grouped.set(key, [...(grouped.get(key) ?? []), event]);
  }

  const rows = Array.from(grouped.entries()).map(([term, itemEvents]) => ({
    term,
    searchCount: itemEvents.length,
    resultCount: 0,
    companyCount: new Set(itemEvents.map((event) => event.companyName ?? event.customerId ?? event.sessionId ?? "anon")).size,
    lastSearchedAt: mostRecent(itemEvents)?.occurredAt ?? "",
    suggestedCategory: suggestCategory(term),
    purchaseOpportunity: itemEvents.length >= 2 ? "Ürün ekleme ve satın alma fırsatı" : "Satın alma kontrolü"
  }));

  return { generatedAt: new Date().toISOString(), rows: rows.sort((a, b) => b.searchCount - a.searchCount) };
}

export async function createSalesOpportunity(input: SalesOpportunityInput, actor: string): Promise<SalesOpportunity> {
  const rows = await loadSalesOpportunities();
  const opportunity: SalesOpportunity = {
    id: `opp-${randomUUID()}`,
    createdAt: new Date().toISOString(),
    createdBy: actor,
    customerId: clean(input.customerId),
    companyName: clean(input.companyName),
    title: clean(input.title) || "Satış fırsatı",
    source: clean(input.source) || "admin",
    score: clampNumber(input.score, 0, 1000),
    status: "open",
    note: clean(input.note)
  };
  await writeJson(opportunitiesPath, [opportunity, ...rows].slice(0, 1000));
  return opportunity;
}

export async function createSalesTask(input: SalesTaskInput, actor: string): Promise<SalesTask> {
  const rows = await loadSalesTasks();
  const task: SalesTask = {
    id: `task-${randomUUID()}`,
    createdAt: new Date().toISOString(),
    createdBy: actor,
    customerId: clean(input.customerId),
    companyName: clean(input.companyName),
    assignee: clean(input.assignee) || actor,
    dueAt: clean(input.dueAt) || new Date().toISOString(),
    title: clean(input.title) || "Müşteri takip görevi",
    status: "open",
    note: clean(input.note)
  };
  await writeJson(tasksPath, [task, ...rows].slice(0, 1000));
  return task;
}

export async function loadSalesOpportunities(): Promise<SalesOpportunity[]> {
  return readJson<SalesOpportunity[]>(opportunitiesPath, []);
}

export async function loadSalesTasks(): Promise<SalesTask[]> {
  return readJson<SalesTask[]>(tasksPath, []);
}

async function toCustomerBehaviorRow(customer: CustomerAccount, events: UserEvent[]): Promise<CustomerBehaviorRow> {
  const customerEvents = events.filter((event) => event.customerId === customer.id);
  const viewEvents = customerEvents.filter((event) => event.type === "product_view");
  const cart = await loadPricedCart(customer);
  const topProduct = topValue(viewEvents.map((event) => event.productName ?? event.sku ?? ""));
  const topCategory = topValue(customerEvents.map((event) => event.category ?? ""));
  const lastVisitAt = mostRecent(customerEvents)?.occurredAt ?? "";
  const cartTotal = cart.items.length > 0 ? cart.displayTotal : formatCatalogMoney("0", "TRY");
  const hot = cart.items.length > 0 || viewEvents.length >= 4;

  return {
    customerId: customer.id,
    companyName: customer.companyName,
    userName: customer.authorizedPerson,
    segment: customer.segment,
    accountManager: customer.accountManager ?? "Satış Operasyon",
    topProduct: topProduct || "-",
    topCategory: topCategory || "-",
    lastVisitAt,
    productViewCount: viewEvents.length,
    abandonedItemCount: cart.items.length,
    abandonedCartTotal: cartTotal,
    actionStatus: hot ? "Satış fırsatı" : "Normal takip",
    aiSummary:
      cart.items.length > 0
        ? `${customer.companyName} sepetinde ${cart.items.length} satır ürün bıraktı. ${topCategory || "Katalog"} ilgisi yüksek; temsilci teklif için aramalı.`
        : viewEvents.length > 0
          ? `${customer.companyName} son aktivitelerinde ${viewEvents.length} ürün inceledi. ${topProduct || "İlgili ürün"} için fiyat/alternatif teklif önerilir.`
          : "Henüz anlamlı davranış sinyali oluşmadı."
  };
}

async function ensureEventFile(): Promise<void> {
  if (existsSync(eventsPath)) {
    return;
  }

  await mkdir(dataDir, { recursive: true });
  await writeJson(eventsPath, await createInitialEvents());
}

async function createInitialEvents(): Promise<UserEvent[]> {
  const [customers, store] = await Promise.all([getCustomers(), loadCatalogStore()]);
  const products = store.products.filter((product) => product.status === "ACTIVE" && product.isVisible).slice(0, 6);
  const now = Date.now();
  const rows: UserEvent[] = [];

  customers.slice(0, 3).forEach((customer, customerIndex) => {
    products.slice(customerIndex, customerIndex + 3).forEach((product, productIndex) => {
      rows.push(
        withCustomer(customer, {
          id: `seed-view-${customer.id}-${product.sku}`,
          type: "product_view",
          occurredAt: new Date(now - (customerIndex * 8 + productIndex + 1) * 60 * 60 * 1000).toISOString(),
          productId: product.id,
          productSlug: product.slug,
          productName: product.name,
          sku: product.sku,
          brand: product.brand,
          category: product.category,
          durationSeconds: 24 + productIndex * 16,
          sessionId: `seed-session-${customer.id}`
        })
      );
    });
  });

  if (customers[1] && products[1]) {
    rows.push(
      withCustomer(customers[1], {
        id: "seed-cart-industrial",
        type: "cart_add",
        occurredAt: new Date(now - 2 * 60 * 60 * 1000).toISOString(),
        productId: products[1].id,
        productSlug: products[1].slug,
        productName: products[1].name,
        sku: products[1].sku,
        brand: products[1].brand,
        category: products[1].category,
        quantity: 2,
        sessionId: `seed-session-${customers[1].id}`
      })
    );
  }

  rows.push({
    id: "seed-search-miss-1",
    type: "search",
    occurredAt: new Date(now - 5 * 60 * 60 * 1000).toISOString(),
    customerId: customers[2]?.id,
    companyName: customers[2]?.companyName,
    userName: customers[2]?.authorizedPerson,
    customerSegment: customers[2]?.segment,
    searchTerm: "akülü kırıcı hilti",
    resultCount: 0,
    successful: false,
    sessionId: "seed-search-project"
  });

  return rows;
}

function withCustomer<T extends Omit<UserEvent, "id" | "occurredAt"> & { id?: string; occurredAt?: string }>(customer: CustomerAccount | null, event: T): UserEvent {
  return stripUndefined({
    ...event,
    id: event.id ?? `evt-${randomUUID()}`,
    occurredAt: event.occurredAt ?? new Date().toISOString(),
    customerId: customer?.id,
    companyId: customer?.id,
    companyName: customer?.companyName,
    userName: customer?.authorizedPerson,
    customerSegment: customer?.segment,
    accountManager: customer?.accountManager
  }) as UserEvent;
}

function mostRecent(events: UserEvent[]): UserEvent | undefined {
  return [...events].sort((a, b) => Date.parse(b.occurredAt) - Date.parse(a.occurredAt))[0];
}

function buildWhatsappHref(phone: string, message: string): string {
  const digits = (phone ?? "").replace(/\D+/g, "");
  let international = digits;
  if (digits.startsWith("0")) {
    international = `9${digits}`;
  } else if (digits.startsWith("5")) {
    international = `90${digits}`;
  }

  const text = `?text=${encodeURIComponent(message)}`;
  // numara cikarilamazsa alicisiz paylasim linkine dusulur
  return international.length >= 12 ? `https://wa.me/${international}${text}` : `https://wa.me/${text}`;
}

function topValue(values: string[]): string {
  const counts = new Map<string, number>();
  for (const value of values.map(clean).filter(Boolean)) {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }

  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "";
}

function countType(events: UserEvent[], type: UserEventType): number {
  return events.filter((event) => event.type === type).length;
}

function suggestCategory(term: string): string {
  const normalized = normalize(term);
  if (normalized.includes("pompa")) {
    return "Pompa ve Su Sistemleri";
  }
  if (normalized.includes("matkap") || normalized.includes("kirici") || normalized.includes("hilti")) {
    return "Elektrikli El Aletleri";
  }
  if (normalized.includes("musluk") || normalized.includes("batarya")) {
    return "Musluklar ve Bataryalar";
  }
  return "Satın alma kontrolü";
}

function formatAge(value: string): string {
  const date = Date.parse(value);
  if (!Number.isFinite(date)) {
    return "-";
  }

  const hours = Math.max(0, Math.round((Date.now() - date) / (60 * 60 * 1000)));
  if (hours < 24) {
    return `${hours} saat önce`;
  }
  return `${Math.round(hours / 24)} gün önce`;
}

async function readJson<T>(filePath: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await readFile(filePath, "utf8")) as T;
  } catch (error) {
    const code = typeof error === "object" && error !== null && "code" in error ? String(error.code) : "";
    if (code === "ENOENT") {
      return fallback;
    }

    throw error;
  }
}

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  const tmpPath = `${filePath}.${process.pid}.tmp`;
  await writeFile(tmpPath, `${JSON.stringify(value, null, 2)}\n`);
  await rename(tmpPath, filePath);
}

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalize(value: string): string {
  return value
    .trim()
    .toLocaleLowerCase("tr-TR")
    .replace(/[ç]/g, "c")
    .replace(/[ğ]/g, "g")
    .replace(/[ı]/g, "i")
    .replace(/[ö]/g, "o")
    .replace(/[ş]/g, "s")
    .replace(/[ü]/g, "u");
}

function clampNumber(value: unknown, min: number, max: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return min;
  }

  return Math.min(Math.max(Math.trunc(parsed), min), max);
}

function stripUndefined<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map(stripUndefined) as T;
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, entry]) => entry !== undefined)
        .map(([key, entry]) => [key, stripUndefined(entry)])
    ) as T;
  }

  return value;
}

function findWorkspaceRoot(startDir: string): string {
  let current = startDir;

  while (current !== path.dirname(current)) {
    if (isWorkspaceRoot(current)) {
      return current;
    }

    current = path.dirname(current);
  }

  return startDir;
}

function isWorkspaceRoot(dir: string): boolean {
  return existsSync(path.join(dir, "pnpm-workspace.yaml")) || existsSync(path.join(dir, "data", "catalog-store.json"));
}
