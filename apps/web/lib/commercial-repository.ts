import "server-only";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import type { CatalogProductRecord } from "@entas/catalog";
import { loadCatalogStore } from "./catalog-repository";
import { createNotification } from "./notification-repository";

export type QuoteStatus = "DRAFT" | "SUBMITTED" | "ASSIGNED" | "PRICED" | "APPROVED" | "REJECTED" | "EXPIRED" | "CONVERTED";
export type OrderStatus =
  | "DRAFT"
  | "PAYMENT_PENDING"
  | "APPROVAL_PENDING"
  | "FINANCE_APPROVAL_PENDING"
  | "STOCK_WAITING"
  | "PREPARING"
  | "READY_TO_SHIP"
  | "SHIPPED"
  | "DELIVERED"
  | "CANCELLED"
  | "COMPLETED";

export type CommercialActor = "customer" | "admin" | "system";

export interface CommercialHistoryEntry {
  id: string;
  at: string;
  actor: CommercialActor;
  actorName: string;
  message: string;
  fromStatus?: string;
  toStatus?: string;
}

export interface QuoteItem {
  id: string;
  sku: string;
  barcode?: string;
  manufacturerCode?: string;
  productName: string;
  brand?: string;
  category?: string;
  catalogProductId?: string;
  unit: string;
  quantity: number;
  targetPrice?: string;
  targetDeliveryDate?: string;
  quotedUnitPrice?: string;
  lineTotal?: string;
  currency: string;
  stockStatus?: string;
  catalogListPrice?: string;
}

export interface OrderItem {
  id: string;
  sku: string;
  productName: string;
  brand?: string;
  category?: string;
  unit: string;
  quantity: number;
  unitPrice: string;
  lineTotal: string;
  currency: string;
  stockStatus?: string;
  quoteItemId?: string;
}

export interface AdminQuote {
  id: string;
  quoteNo: string;
  trackingCode: string;
  companyName: string;
  dealerName: string;
  authorizedPerson: string;
  phone: string;
  email: string;
  projectName: string;
  projectCode: string;
  deliveryCity: string;
  deliveryAddress: string;
  requestedAt: string;
  status: QuoteStatus;
  totalAmount: string;
  currency: string;
  salesRepresentative: string;
  lastActionAt: string;
  validUntil: string;
  paymentPreference: string;
  customerNote: string;
  internalNote: string;
  convertedToOrder: boolean;
  convertedOrderId?: string;
  items: QuoteItem[];
  history: CommercialHistoryEntry[];
}

export interface AdminOrder {
  id: string;
  orderNo: string;
  trackingCode: string;
  quoteId?: string;
  quoteNo?: string;
  companyName: string;
  dealerUser: string;
  phone: string;
  email: string;
  orderedAt: string;
  status: OrderStatus;
  paymentStatus: string;
  financeApproval: string;
  stockStatus: string;
  shipmentStatus: string;
  totalAmount: string;
  currency: string;
  salesRepresentative: string;
  deliveryAddress: string;
  source: string;
  warehouse: string;
  customerNote: string;
  internalNote: string;
  items: OrderItem[];
  history: CommercialHistoryEntry[];
}

export interface CreateQuoteItemInput {
  sku?: string;
  productName?: string;
  quantity?: number;
  unit?: string;
  targetPrice?: string;
  targetDeliveryDate?: string;
}

export interface CreateQuoteInput {
  companyTitle: string;
  authorizedPerson: string;
  phone: string;
  email: string;
  projectName?: string;
  projectCode?: string;
  deliveryCity?: string;
  deliveryAddress?: string;
  paymentPreference?: string;
  notes?: string;
  items: CreateQuoteItemInput[];
}

export interface PriceQuoteInput {
  quoteId: string;
  validUntil?: string | undefined;
  salesRepresentative?: string | undefined;
  internalNote?: string | undefined;
  prices: Array<{ itemId: string; quotedUnitPrice: string }>;
}

export interface OrderOperationInput {
  orderId: string;
  status?: OrderStatus | undefined;
  paymentStatus?: string | undefined;
  financeApproval?: string | undefined;
  stockStatus?: string | undefined;
  shipmentStatus?: string | undefined;
  warehouse?: string | undefined;
  internalNote?: string | undefined;
}

export interface AdminListFilters {
  q?: string;
  status?: string;
  company?: string;
  salesRepresentative?: string;
  dateFrom?: string;
  dateTo?: string;
  financeApproval?: string;
  warehouse?: string;
  limit?: number;
  offset?: number;
}

export interface AdminListResult<T> {
  total: number;
  limit: number;
  offset: number;
  items: T[];
}

const rootDir = findWorkspaceRoot(process.cwd());
const dataDir = process.env.ENTAS_COMMERCIAL_DATA_DIR ? path.resolve(process.env.ENTAS_COMMERCIAL_DATA_DIR) : path.join(rootDir, "data");
const quotesPath = path.join(dataDir, "quotes.json");
const ordersPath = path.join(dataDir, "orders.json");
const DEFAULT_CURRENCY = "TRY";
const DEFAULT_REPRESENTATIVE = "Atanmadi";

export async function createQuote(input: CreateQuoteInput): Promise<AdminQuote> {
  const normalized = normalizeCreateQuoteInput(input);
  const [quotes, catalogStore] = await Promise.all([loadQuotes(), loadCatalogStore()]);
  const now = new Date().toISOString();
  const items = buildQuoteItems(normalized.items, catalogStore.products);
  const quoteNo = nextNumber("TEK", quotes.length + 1, now);
  const quote: AdminQuote = {
    id: `quote-${randomUUID()}`,
    quoteNo,
    trackingCode: trackingCode("T"),
    companyName: normalized.companyTitle,
    dealerName: normalized.authorizedPerson,
    authorizedPerson: normalized.authorizedPerson,
    phone: normalized.phone,
    email: normalized.email,
    projectName: normalized.projectName,
    projectCode: normalized.projectCode,
    deliveryCity: normalized.deliveryCity,
    deliveryAddress: normalized.deliveryAddress,
    requestedAt: now,
    status: "SUBMITTED",
    totalAmount: "0.00",
    currency: items[0]?.currency ?? DEFAULT_CURRENCY,
    salesRepresentative: DEFAULT_REPRESENTATIVE,
    lastActionAt: now,
    validUntil: addDays(now, 7),
    paymentPreference: normalized.paymentPreference,
    customerNote: normalized.notes,
    internalNote: "",
    convertedToOrder: false,
    items,
    history: [historyEntry("customer", normalized.authorizedPerson, "Teklif talebi olusturuldu.", undefined, "SUBMITTED", now)]
  };

  await saveQuotes([quote, ...quotes]);
  await createNotification({
    recipientType: "admin",
    recipientKey: "admin",
    level: "info",
    title: "Yeni teklif talebi",
    body: `${quote.companyName} tarafindan ${quote.items.length} satirlik teklif talebi olusturuldu.`,
    href: `/admin/quotes/${quote.id}`
  });
  return quote;
}

export async function searchAdminQuotes(filters: AdminListFilters = {}): Promise<AdminListResult<AdminQuote>> {
  const rows = await loadQuotes();
  const filtered = rows.filter((row) => {
    if (filters.status && filters.status !== "all" && row.status !== filters.status) {
      return false;
    }

    if (filters.company && !normalize(row.companyName).includes(normalize(filters.company))) {
      return false;
    }

    if (filters.salesRepresentative && !normalize(row.salesRepresentative).includes(normalize(filters.salesRepresentative))) {
      return false;
    }

    if (!isWithinDate(row.requestedAt, filters.dateFrom, filters.dateTo)) {
      return false;
    }

    if (!filters.q) {
      return true;
    }

    const term = normalize(filters.q);
    return [
      row.quoteNo,
      row.trackingCode,
      row.companyName,
      row.dealerName,
      row.email,
      row.phone,
      row.salesRepresentative,
      row.status,
      ...row.items.flatMap((item) => [item.sku, item.productName, item.brand ?? "", item.category ?? ""])
    ].some((value) => normalize(value).includes(term));
  });

  return paginate(filtered, filters);
}

export async function getAdminQuoteById(id: string): Promise<AdminQuote | null> {
  const rows = await loadQuotes();
  return rows.find((row) => row.id === id) ?? null;
}

export async function getQuoteByTrackingCode(code: string): Promise<AdminQuote | null> {
  const normalized = normalize(code);
  if (!normalized) {
    return null;
  }

  const rows = await loadQuotes();
  return rows.find((row) => normalize(row.trackingCode) === normalized || normalize(row.quoteNo) === normalized) ?? null;
}

export async function updateQuoteStatus(id: string, status: QuoteStatus, actorName: string, message?: string): Promise<AdminQuote> {
  const quotes = await loadQuotes();
  const index = quotes.findIndex((quote) => quote.id === id);
  if (index === -1) {
    throw new Error("Teklif bulunamadi.");
  }

  const now = new Date().toISOString();
  const quote = quotes[index]!;
  const nextQuote: AdminQuote = {
    ...quote,
    status,
    lastActionAt: now,
    history: [
      historyEntry("admin", actorName, message || `Teklif durumu ${status} olarak guncellendi.`, quote.status, status, now),
      ...quote.history
    ]
  };

  quotes[index] = nextQuote;
  await saveQuotes(quotes);
  await createNotification({
    recipientType: "customer",
    recipientKey: nextQuote.email,
    level: status === "REJECTED" ? "danger" : "info",
    title: `Teklif durumu: ${status}`,
    body: `${nextQuote.quoteNo} teklifinizin durumu guncellendi.`,
    href: `/quote/${nextQuote.trackingCode}`
  });
  return nextQuote;
}

export async function priceQuote(input: PriceQuoteInput, actorName: string): Promise<AdminQuote> {
  const quotes = await loadQuotes();
  const index = quotes.findIndex((quote) => quote.id === input.quoteId);
  if (index === -1) {
    throw new Error("Teklif bulunamadi.");
  }

  const now = new Date().toISOString();
  const quote = quotes[index]!;
  const priceByItemId = new Map(input.prices.map((item) => [item.itemId, parseMoney(item.quotedUnitPrice)]));
  const items = quote.items.map((item) => {
    const quoted = priceByItemId.get(item.id);
    if (quoted == null) {
      return item;
    }

    return {
      ...item,
      quotedUnitPrice: money(quoted),
      lineTotal: money(quoted * item.quantity)
    };
  });

  const total = items.reduce((sum, item) => sum + parseMoney(item.lineTotal ?? "0"), 0);
  const nextQuote: AdminQuote = {
    ...quote,
    items,
    status: "PRICED",
    totalAmount: money(total),
    validUntil: input.validUntil ? new Date(`${input.validUntil}T23:59:59.999Z`).toISOString() : quote.validUntil,
    salesRepresentative: clean(input.salesRepresentative) || quote.salesRepresentative || actorName,
    internalNote: clean(input.internalNote) || quote.internalNote,
    lastActionAt: now,
    history: [historyEntry("admin", actorName, "Teklif fiyatlandirildi.", quote.status, "PRICED", now), ...quote.history]
  };

  quotes[index] = nextQuote;
  await saveQuotes(quotes);
  await createNotification({
    recipientType: "customer",
    recipientKey: nextQuote.email,
    level: "success",
    title: "Teklifiniz fiyatlandi",
    body: `${nextQuote.quoteNo} teklifiniz ${nextQuote.totalAmount} ${nextQuote.currency} olarak fiyatlandi.`,
    href: `/quote/${nextQuote.trackingCode}`
  });
  return nextQuote;
}

export async function convertQuoteToOrder(id: string, actorName: string, actor: CommercialActor = "admin"): Promise<AdminOrder> {
  const [quotes, orders] = await Promise.all([loadQuotes(), loadOrders()]);
  const quoteIndex = quotes.findIndex((quote) => quote.id === id);
  if (quoteIndex === -1) {
    throw new Error("Teklif bulunamadi.");
  }

  const quote = quotes[quoteIndex]!;
  if (quote.convertedOrderId) {
    const existing = orders.find((order) => order.id === quote.convertedOrderId);
    if (existing) {
      return existing;
    }
  }

  const now = new Date().toISOString();
  const orderNo = nextNumber("SIP", orders.length + 1, now);
  const items = quote.items.map<OrderItem>((item) => {
    const unitPrice = parseMoney(item.quotedUnitPrice ?? item.targetPrice ?? "0");
    return stripUndefined({
      id: `order-item-${randomUUID()}`,
      sku: item.sku,
      productName: item.productName,
      brand: item.brand,
      category: item.category,
      unit: item.unit,
      quantity: item.quantity,
      unitPrice: money(unitPrice),
      lineTotal: money(unitPrice * item.quantity),
      currency: item.currency,
      stockStatus: item.stockStatus,
      quoteItemId: item.id
    }) as OrderItem;
  });
  const total = items.reduce((sum, item) => sum + parseMoney(item.lineTotal), 0);
  const order: AdminOrder = {
    id: `order-${randomUUID()}`,
    orderNo,
    trackingCode: trackingCode("S"),
    quoteId: quote.id,
    quoteNo: quote.quoteNo,
    companyName: quote.companyName,
    dealerUser: quote.dealerName,
    phone: quote.phone,
    email: quote.email,
    orderedAt: now,
    status: "FINANCE_APPROVAL_PENDING",
    paymentStatus: quote.paymentPreference || "Odeme bekliyor",
    financeApproval: "Bekliyor",
    stockStatus: "Kontrol bekliyor",
    shipmentStatus: "Planlanmadi",
    totalAmount: money(total),
    currency: quote.currency,
    salesRepresentative: quote.salesRepresentative || actorName,
    deliveryAddress: quote.deliveryAddress || quote.deliveryCity || "Adres teyidi bekliyor",
    source: actor === "customer" ? "Musteri teklif onayi" : "Admin teklif donusumu",
    warehouse: "Ana Depo",
    customerNote: quote.customerNote,
    internalNote: "",
    items,
    history: [
      historyEntry(actor, actorName, `${quote.quoteNo} teklifinden siparis olusturuldu.`, undefined, "FINANCE_APPROVAL_PENDING", now)
    ]
  };

  const nextQuote: AdminQuote = {
    ...quote,
    status: "CONVERTED",
    convertedToOrder: true,
    convertedOrderId: order.id,
    lastActionAt: now,
    history: [historyEntry(actor, actorName, `${order.orderNo} siparisine donustu.`, quote.status, "CONVERTED", now), ...quote.history]
  };

  quotes[quoteIndex] = nextQuote;
  await Promise.all([saveQuotes(quotes), saveOrders([order, ...orders])]);
  await Promise.all([
    createNotification({
      recipientType: "customer",
      recipientKey: order.email,
      level: "success",
      title: "Siparis olusturuldu",
      body: `${order.orderNo} siparisiniz olusturuldu ve operasyon takibine alindi.`,
      href: `/orders/${order.trackingCode}`
    }),
    createNotification({
      recipientType: "admin",
      recipientKey: "admin",
      level: "success",
      title: "Yeni siparis",
      body: `${order.companyName} icin ${order.orderNo} siparisi olusturuldu.`,
      href: `/admin/orders/${order.id}`
    })
  ]);
  return order;
}

export async function searchAdminOrders(filters: AdminListFilters = {}): Promise<AdminListResult<AdminOrder>> {
  const rows = await loadOrders();
  const filtered = rows.filter((row) => {
    if (filters.status && filters.status !== "all" && row.status !== filters.status) {
      return false;
    }

    if (filters.financeApproval && filters.financeApproval !== "all" && row.financeApproval !== filters.financeApproval) {
      return false;
    }

    if (filters.warehouse && filters.warehouse !== "all" && row.warehouse !== filters.warehouse) {
      return false;
    }

    if (filters.company && !normalize(row.companyName).includes(normalize(filters.company))) {
      return false;
    }

    if (filters.salesRepresentative && !normalize(row.salesRepresentative).includes(normalize(filters.salesRepresentative))) {
      return false;
    }

    if (!isWithinDate(row.orderedAt, filters.dateFrom, filters.dateTo)) {
      return false;
    }

    if (!filters.q) {
      return true;
    }

    const term = normalize(filters.q);
    return [
      row.orderNo,
      row.trackingCode,
      row.quoteNo ?? "",
      row.companyName,
      row.dealerUser,
      row.email,
      row.salesRepresentative,
      row.status,
      row.source,
      ...row.items.flatMap((item) => [item.sku, item.productName, item.brand ?? "", item.category ?? ""])
    ].some((value) => normalize(value).includes(term));
  });

  return paginate(filtered, filters);
}

export async function getAdminOrderById(id: string): Promise<AdminOrder | null> {
  const rows = await loadOrders();
  return rows.find((row) => row.id === id) ?? null;
}

export async function getOrderByTrackingCode(code: string): Promise<AdminOrder | null> {
  const normalized = normalize(code);
  if (!normalized) {
    return null;
  }

  const rows = await loadOrders();
  return rows.find((row) => normalize(row.trackingCode) === normalized || normalize(row.orderNo) === normalized) ?? null;
}

export async function updateOrderOperation(input: OrderOperationInput, actorName: string): Promise<AdminOrder> {
  const orders = await loadOrders();
  const index = orders.findIndex((order) => order.id === input.orderId);
  if (index === -1) {
    throw new Error("Siparis bulunamadi.");
  }

  const now = new Date().toISOString();
  const order = orders[index]!;
  const nextStatus = input.status ?? order.status;
  const nextOrder: AdminOrder = {
    ...order,
    status: nextStatus,
    paymentStatus: clean(input.paymentStatus) || order.paymentStatus,
    financeApproval: clean(input.financeApproval) || order.financeApproval,
    stockStatus: clean(input.stockStatus) || order.stockStatus,
    shipmentStatus: clean(input.shipmentStatus) || order.shipmentStatus,
    warehouse: clean(input.warehouse) || order.warehouse,
    internalNote: clean(input.internalNote) || order.internalNote,
    history: [
      historyEntry("admin", actorName, input.internalNote ? clean(input.internalNote) : "Siparis operasyon bilgileri guncellendi.", order.status, nextStatus, now),
      ...order.history
    ]
  };

  orders[index] = nextOrder;
  await saveOrders(orders);
  await createNotification({
    recipientType: "customer",
    recipientKey: nextOrder.email,
    level: nextStatus === "CANCELLED" ? "danger" : nextStatus === "DELIVERED" || nextStatus === "COMPLETED" ? "success" : "info",
    title: `Siparis durumu: ${nextStatus}`,
    body: `${nextOrder.orderNo} siparisiniz guncellendi. Finans: ${nextOrder.financeApproval}, stok: ${nextOrder.stockStatus}, sevkiyat: ${nextOrder.shipmentStatus}.`,
    href: `/orders/${nextOrder.trackingCode}`
  });
  return nextOrder;
}

export async function ensureCommercialDataFiles(): Promise<void> {
  await mkdir(dataDir, { recursive: true });

  if (!existsSync(quotesPath)) {
    await writeJson(quotesPath, []);
  }

  if (!existsSync(ordersPath)) {
    await writeJson(ordersPath, []);
  }
}

export async function loadCommercialStats() {
  const [quotes, orders] = await Promise.all([loadQuotes(), loadOrders()]);
  return {
    quotes: quotes.length,
    orders: orders.length,
    pendingQuotes: quotes.filter((quote) => quote.status === "SUBMITTED" || quote.status === "ASSIGNED").length,
    pricedQuotes: quotes.filter((quote) => quote.status === "PRICED" || quote.status === "APPROVED").length,
    openOrders: orders.filter((order) => !["DELIVERED", "COMPLETED", "CANCELLED"].includes(order.status)).length,
    orderRevenue: money(orders.reduce((sum, order) => sum + parseMoney(order.totalAmount), 0))
  };
}

async function loadQuotes(): Promise<AdminQuote[]> {
  await ensureDataFile(quotesPath);
  const rows = await readJson<AdminQuote[]>(quotesPath, []);
  return rows.map(normalizeStoredQuote);
}

async function loadOrders(): Promise<AdminOrder[]> {
  await ensureDataFile(ordersPath);
  const rows = await readJson<AdminOrder[]>(ordersPath, []);
  return rows.map(normalizeStoredOrder);
}

async function saveQuotes(rows: AdminQuote[]): Promise<void> {
  await writeJson(quotesPath, rows.map(stripUndefined));
}

async function saveOrders(rows: AdminOrder[]): Promise<void> {
  await writeJson(ordersPath, rows.map(stripUndefined));
}

async function ensureDataFile(filePath: string): Promise<void> {
  if (existsSync(filePath)) {
    return;
  }

  await mkdir(path.dirname(filePath), { recursive: true });
  await writeJson(filePath, []);
}

function normalizeCreateQuoteInput(input: CreateQuoteInput): Required<CreateQuoteInput> {
  const normalized: Required<CreateQuoteInput> = {
    companyTitle: clean(input.companyTitle),
    authorizedPerson: clean(input.authorizedPerson),
    phone: clean(input.phone),
    email: clean(input.email).toLocaleLowerCase("tr-TR"),
    projectName: clean(input.projectName),
    projectCode: clean(input.projectCode),
    deliveryCity: clean(input.deliveryCity),
    deliveryAddress: clean(input.deliveryAddress),
    paymentPreference: clean(input.paymentPreference) || "Havale/EFT",
    notes: clean(input.notes),
    items: input.items
  };

  if (normalized.companyTitle.length < 2) {
    throw new Error("Firma unvani zorunludur.");
  }

  if (normalized.authorizedPerson.length < 2) {
    throw new Error("Yetkili kisi zorunludur.");
  }

  if (normalized.phone.length < 10) {
    throw new Error("Telefon zorunludur.");
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized.email)) {
    throw new Error("Gecerli e-posta girin.");
  }

  if (!normalized.items.some((item) => clean(item.sku) || clean(item.productName))) {
    throw new Error("En az bir urun satiri girilmelidir.");
  }

  return normalized;
}

function buildQuoteItems(inputItems: CreateQuoteItemInput[], catalogProducts: CatalogProductRecord[]): QuoteItem[] {
  return inputItems
    .map((input) => {
      const sku = clean(input.sku);
      const productName = clean(input.productName);
      if (!sku && !productName) {
        return null;
      }

      const catalogProduct = findCatalogProduct(catalogProducts, sku, productName);
      const quantity = Math.max(1, Math.trunc(Number(input.quantity) || 1));
      const currency = catalogProduct?.currency === "TL" ? "TRY" : catalogProduct?.currency || DEFAULT_CURRENCY;
      return stripUndefined({
        id: `quote-item-${randomUUID()}`,
        sku: catalogProduct?.sku || sku || "OZEL-URUN",
        barcode: catalogProduct?.barcode,
        manufacturerCode: catalogProduct?.manufacturerCode,
        productName: catalogProduct?.name || productName || sku,
        brand: catalogProduct?.brand,
        category: catalogProduct?.category,
        catalogProductId: catalogProduct?.id,
        unit: clean(input.unit) || catalogProduct?.unitType || "Adet",
        quantity,
        targetPrice: normalizeOptionalMoney(input.targetPrice),
        targetDeliveryDate: clean(input.targetDeliveryDate),
        currency,
        stockStatus: catalogProduct?.stockStatus,
        catalogListPrice: catalogProduct?.listPrice
      }) as QuoteItem;
    })
    .filter((item): item is QuoteItem => item !== null);
}

function findCatalogProduct(products: CatalogProductRecord[], sku: string, productName: string): CatalogProductRecord | undefined {
  const normalizedSku = normalize(sku);
  const normalizedName = normalize(productName);

  if (normalizedSku) {
    const exact = products.find((product) =>
      [product.sku, product.barcode ?? "", product.manufacturerCode ?? ""].some((value) => normalize(value) === normalizedSku)
    );
    if (exact) {
      return exact;
    }

    const loose = products.find((product) => normalize(product.name).includes(normalizedSku));
    if (loose) {
      return loose;
    }
  }

  if (normalizedName) {
    return products.find((product) => normalize(product.name).includes(normalizedName) || normalizedName.includes(normalize(product.name)));
  }

  return undefined;
}

function normalizeStoredQuote(row: AdminQuote): AdminQuote {
  return {
    ...row,
    trackingCode: row.trackingCode ?? row.quoteNo,
    authorizedPerson: row.authorizedPerson ?? row.dealerName ?? "",
    phone: row.phone ?? "",
    email: row.email ?? "",
    projectName: row.projectName ?? "",
    projectCode: row.projectCode ?? "",
    deliveryCity: row.deliveryCity ?? "",
    deliveryAddress: row.deliveryAddress ?? "",
    paymentPreference: row.paymentPreference ?? "Havale/EFT",
    customerNote: row.customerNote ?? "",
    internalNote: row.internalNote ?? "",
    convertedToOrder: Boolean(row.convertedToOrder),
    items: row.items ?? [],
    history: row.history ?? []
  };
}

function normalizeStoredOrder(row: AdminOrder): AdminOrder {
  return {
    ...row,
    trackingCode: row.trackingCode ?? row.orderNo,
    phone: row.phone ?? "",
    email: row.email ?? "",
    quoteNo: row.quoteNo ?? "",
    customerNote: row.customerNote ?? "",
    internalNote: row.internalNote ?? "",
    items: row.items ?? [],
    history: row.history ?? []
  };
}

function paginate<T>(rows: T[], filters: AdminListFilters): AdminListResult<T> {
  const limit = Math.min(Math.max(1, filters.limit ?? 25), 100);
  const requestedOffset = Math.max(0, filters.offset ?? 0);
  const offset = requestedOffset >= rows.length && rows.length > 0 ? 0 : requestedOffset;

  return {
    total: rows.length,
    limit,
    offset,
    items: rows.slice(offset, offset + limit)
  };
}

function normalize(value: string): string {
  return clean(value)
    .toLocaleLowerCase("tr-TR")
    .replace(/[ç]/g, "c")
    .replace(/[ğ]/g, "g")
    .replace(/[ı]/g, "i")
    .replace(/[ö]/g, "o")
    .replace(/[ş]/g, "s")
    .replace(/[ü]/g, "u");
}

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function isWithinDate(value: string, dateFrom?: string, dateTo?: string): boolean {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) {
    return true;
  }

  if (dateFrom && timestamp < Date.parse(dateFrom)) {
    return false;
  }

  if (dateTo && timestamp > Date.parse(`${dateTo}T23:59:59.999Z`)) {
    return false;
  }

  return true;
}

function nextNumber(prefix: "TEK" | "SIP", sequence: number, now: string): string {
  const day = now.slice(0, 10).replace(/-/g, "");
  return `${prefix}-${day}-${String(sequence).padStart(4, "0")}`;
}

function trackingCode(prefix: "T" | "S"): string {
  return `${prefix}${randomUUID().slice(0, 8).toUpperCase()}`;
}

function historyEntry(actor: CommercialActor, actorName: string, message: string, fromStatus?: string, toStatus?: string, at = new Date().toISOString()): CommercialHistoryEntry {
  return stripUndefined({
    id: `history-${randomUUID()}`,
    at,
    actor,
    actorName,
    message,
    fromStatus,
    toStatus
  }) as CommercialHistoryEntry;
}

function addDays(value: string, days: number): string {
  const date = new Date(value);
  date.setDate(date.getDate() + days);
  return date.toISOString();
}

function parseMoney(value: string): number {
  const raw = clean(value).replace(/\s/g, "");
  const cleaned = raw.includes(",") ? raw.replace(/\./g, "").replace(",", ".") : raw;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

function normalizeOptionalMoney(value: unknown): string | undefined {
  const raw = clean(value);
  if (!raw) {
    return undefined;
  }

  return money(parseMoney(raw));
}

function money(value: number): string {
  return value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: false });
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
    if (existsSync(path.join(current, "pnpm-workspace.yaml"))) {
      return current;
    }

    current = path.dirname(current);
  }

  return startDir;
}
