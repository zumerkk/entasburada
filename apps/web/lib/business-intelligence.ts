import "server-only";
import type { CatalogProductRecord } from "@entas/catalog";
import { loadUserEvents } from "./analytics-repository";
import { loadCatalogStore } from "./catalog-repository";
import { loadCommercialRecordsForAnalytics, type AdminOrder, type AdminQuote } from "./commercial-repository";
import { getCustomerBalances } from "./customer-balance-repository";
import { getCustomers, type CustomerAccount } from "./customer-auth";

export interface ManagementIntelligenceReport {
  generatedAt: string;
  funnel: { quoteCount: number; pricedCount: number; approvedCount: number; orderCount: number; deliveredCount: number; quoteToOrderRate: number };
  margin: { coveredProducts: number; missingCostProducts: number; lowMarginProducts: Array<{ sku: string; name: string; salePrice: number; costPrice: number; marginRate: number }> };
  quality: { score: number; duplicateGroups: number; duplicateProducts: number; wrongCategoryCandidates: number; noImage: number; noPrice: number; placeholderBrands: number; hotlinkedImages: number };
  slowStock: Array<{ sku: string; name: string; brand: string; stockQuantity: number; lastOrderAt: string; daysWithoutOrder: number }>;
  customerFunnels: Array<{ customerId: string; companyName: string; segment: string; quotes: number; orders: number; revenue: number; conversionRate: number; lastActivityAt: string; risk: string; suggestedSegment: string }>;
  collectionRisks: Array<{ customerId: string; companyName: string; balance: number; creditLimit: number; availableCredit: number; ageDays: number; level: string }>;
  representatives: Array<{ name: string; quotes: number; priced: number; orders: number; revenue: number; conversionRate: number }>;
}

export async function getManagementIntelligenceReport(): Promise<ManagementIntelligenceReport> {
  const [store, commercial, customers, events] = await Promise.all([
    loadCatalogStore(),
    loadCommercialRecordsForAnalytics(),
    getCustomers(),
    loadUserEvents()
  ]);
  const activeProducts = store.products.filter((product) => product.status === "ACTIVE" && product.isVisible);
  const balancesByCustomer = await getCustomerBalances(customers);
  const balances = customers.map((customer) => ({ customer, balance: balancesByCustomer.get(customer.id)! }));
  const now = Date.now();
  const orderBySku = buildLastOrderBySku(commercial.orders);
  const quotesByEmail = groupBy(commercial.quotes, (quote) => normalize(quote.email));
  const ordersByEmail = groupBy(commercial.orders, (order) => normalize(order.email));
  const eventsByCustomer = groupBy(events.filter((event) => Boolean(event.customerId)), (event) => event.customerId!);
  const slowStock = activeProducts
    .filter((product) => product.stockQuantityKnown !== false && product.stockQuantity > 0)
    .map((product) => {
      const lastOrderAt = orderBySku.get(normalize(product.sku)) ?? "";
      const daysWithoutOrder = lastOrderAt ? daysBetween(lastOrderAt, now) : 999;
      return { sku: product.sku, name: product.name, brand: product.brand, stockQuantity: product.stockQuantity, lastOrderAt, daysWithoutOrder };
    })
    .filter((row) => row.daysWithoutOrder >= 90)
    .sort((a, b) => b.stockQuantity - a.stockQuantity || b.daysWithoutOrder - a.daysWithoutOrder)
    .slice(0, 30);

  const customerFunnels = customers.map((customer) => buildCustomerFunnel(
    customer,
    quotesByEmail.get(normalize(customer.email)) ?? [],
    ordersByEmail.get(normalize(customer.email)) ?? [],
    eventsByCustomer.get(customer.id) ?? [],
    now
  ))
    .sort((a, b) => riskRank(b.risk) - riskRank(a.risk) || b.revenue - a.revenue);
  const collectionRisks = balances
    .filter(({ balance }) => balance.balance > 0)
    .map(({ customer, balance }) => {
      const ageDays = balance.lastEntryAt ? daysBetween(balance.lastEntryAt, now) : 999;
      const utilization = balance.creditLimit > 0 ? balance.balance / balance.creditLimit : 0;
      return {
        customerId: customer.id,
        companyName: customer.companyName,
        balance: balance.balance,
        creditLimit: balance.creditLimit,
        availableCredit: balance.availableCredit,
        ageDays,
        level: balance.overLimit ? "Limit aşımı" : ageDays >= 60 ? "Gecikmiş" : utilization >= 0.8 ? "Limite yakın" : "Takip"
      };
    })
    .sort((a, b) => collectionRank(b.level) - collectionRank(a.level) || b.balance - a.balance);

  return {
    generatedAt: new Date().toISOString(),
    funnel: buildFunnel(commercial.quotes, commercial.orders),
    margin: buildMarginReport(activeProducts),
    quality: buildQualityReport(activeProducts),
    slowStock,
    customerFunnels,
    collectionRisks,
    representatives: buildRepresentativeReport(commercial.quotes, commercial.orders)
  };
}

function buildFunnel(quotes: AdminQuote[], orders: AdminOrder[]) {
  const pricedCount = quotes.filter((quote) => ["PRICED", "APPROVED", "CONVERTED"].includes(quote.status)).length;
  const approvedCount = quotes.filter((quote) => ["APPROVED", "CONVERTED"].includes(quote.status)).length;
  const deliveredCount = orders.filter((order) => ["DELIVERED", "COMPLETED"].includes(order.status)).length;
  return { quoteCount: quotes.length, pricedCount, approvedCount, orderCount: orders.length, deliveredCount, quoteToOrderRate: percent(orders.length, quotes.length) };
}

function buildMarginReport(products: CatalogProductRecord[]) {
  const covered = products.flatMap((product) => {
    const cost = findCost(product);
    const sale = number(product.listPrice);
    return cost > 0 && sale > 0 ? [{ product, cost, sale, rate: ((sale - cost) / sale) * 100 }] : [];
  });
  return {
    coveredProducts: covered.length,
    missingCostProducts: products.length - covered.length,
    lowMarginProducts: covered.filter((item) => item.rate < 12).sort((a, b) => a.rate - b.rate).slice(0, 30).map((item) => ({ sku: item.product.sku, name: item.product.name, salePrice: item.sale, costPrice: item.cost, marginRate: round(item.rate) }))
  };
}

function buildQualityReport(products: CatalogProductRecord[]) {
  const duplicateGroups = new Map<string, CatalogProductRecord[]>();
  for (const product of products) {
    const key = `${normalize(product.brand)}|${normalize(product.name)}`;
    const group = duplicateGroups.get(key);
    if (group) group.push(product);
    else duplicateGroups.set(key, [product]);
  }
  const duplicates = [...duplicateGroups.values()].filter((group) => group.length > 1);
  const noImage = products.filter((product) => !product.imageUrl || product.imageUrl.includes("industrial-hero")).length;
  const noPrice = products.filter((product) => number(product.listPrice) <= 0).length;
  const placeholderBrands = products.filter((product) => ["marka bekliyor", "sayim", "markasiz", "unknown"].includes(normalize(product.brand))).length;
  const hotlinkedImages = products.filter((product) => /^https?:\/\//.test(product.imageUrl ?? "")).length;
  const wrongCategoryCandidates = products.filter((product) => {
    const sourceCategory = normalize(product.category);
    const classified = normalize(product.catalogClassification?.categoryLabel ?? "");
    return Boolean(sourceCategory && classified && !sourceCategory.includes(classified) && !classified.includes(sourceCategory));
  }).length;
  const issueWeight = noImage * 2 + noPrice * 2 + placeholderBrands * 1.5 + duplicates.reduce((sum, group) => sum + group.length, 0) + hotlinkedImages * 0.5 + wrongCategoryCandidates;
  const score = Math.max(0, Math.round(100 - (issueWeight / Math.max(1, products.length * 2)) * 100));
  return { score, duplicateGroups: duplicates.length, duplicateProducts: duplicates.reduce((sum, group) => sum + group.length, 0), wrongCategoryCandidates, noImage, noPrice, placeholderBrands, hotlinkedImages };
}

function buildCustomerFunnel(customer: CustomerAccount, customerQuotes: AdminQuote[], customerOrders: AdminOrder[], events: Awaited<ReturnType<typeof loadUserEvents>>, now: number) {
  const revenue = customerOrders.filter((order) => order.status !== "CANCELLED").reduce((sum, order) => sum + number(order.totalAmount), 0);
  const activityDates = [
    ...events.filter((event) => event.customerId === customer.id).map((event) => event.occurredAt),
    ...customerOrders.map((order) => order.orderedAt),
    ...customerQuotes.map((quote) => quote.requestedAt)
  ].filter(Boolean).sort().reverse();
  const lastActivityAt = activityDates[0] ?? "";
  const inactiveDays = lastActivityAt ? daysBetween(lastActivityAt, now) : 999;
  const risk = inactiveDays >= 120 && revenue > 0 ? "Yüksek kayıp riski" : inactiveDays >= 60 ? "Takip gerekli" : customerOrders.length === 0 && customerQuotes.length > 0 ? "Teklif dönüşümü bekliyor" : "Aktif";
  const suggestedSegment = revenue >= 500_000 || customerOrders.length >= 12 ? "Kurumsal Proje" : revenue >= 100_000 || customerOrders.length >= 5 ? "Sanayi Pro" : "Standart Bayi";
  return { customerId: customer.id, companyName: customer.companyName, segment: customer.segment, quotes: customerQuotes.length, orders: customerOrders.length, revenue: round(revenue), conversionRate: percent(customerOrders.length, customerQuotes.length), lastActivityAt, risk, suggestedSegment };
}

function groupBy<T>(rows: T[], keyFor: (row: T) => string): Map<string, T[]> {
  const grouped = new Map<string, T[]>();
  for (const row of rows) {
    const key = keyFor(row);
    const group = grouped.get(key);
    if (group) group.push(row);
    else grouped.set(key, [row]);
  }
  return grouped;
}

function buildRepresentativeReport(quotes: AdminQuote[], orders: AdminOrder[]) {
  const names = new Set([...quotes.map((quote) => quote.salesRepresentative), ...orders.map((order) => order.salesRepresentative)].filter(Boolean));
  return [...names].map((name) => {
    const repQuotes = quotes.filter((quote) => quote.salesRepresentative === name);
    const repOrders = orders.filter((order) => order.salesRepresentative === name);
    return { name, quotes: repQuotes.length, priced: repQuotes.filter((quote) => ["PRICED", "APPROVED", "CONVERTED"].includes(quote.status)).length, orders: repOrders.length, revenue: round(repOrders.filter((order) => order.status !== "CANCELLED").reduce((sum, order) => sum + number(order.totalAmount), 0)), conversionRate: percent(repOrders.length, repQuotes.length) };
  }).sort((a, b) => b.revenue - a.revenue);
}

function buildLastOrderBySku(orders: AdminOrder[]) {
  const map = new Map<string, string>();
  for (const order of orders) for (const item of order.items) {
    const key = normalize(item.sku); const current = map.get(key);
    if (!current || order.orderedAt > current) map.set(key, order.orderedAt);
  }
  return map;
}
function findCost(product: CatalogProductRecord) {
  const spec = (product.technicalSpecs ?? []).find((entry) => /^(maliyet|alis fiyati|alış fiyatı|cost)$/i.test(entry.label.trim()));
  return number(spec?.value ?? "0");
}
function number(value: unknown) { const parsed = Number(String(value ?? 0).replace(/[^0-9,.-]/g, "").replace(",", ".")); return Number.isFinite(parsed) ? parsed : 0; }
function normalize(value: string) { return value.trim().toLocaleLowerCase("tr-TR").replace(/[ç]/g, "c").replace(/[ğ]/g, "g").replace(/[ı]/g, "i").replace(/[ö]/g, "o").replace(/[ş]/g, "s").replace(/[ü]/g, "u").replace(/\s+/g, " "); }
function daysBetween(value: string, now: number) { const parsed = Date.parse(value); return Number.isFinite(parsed) ? Math.max(0, Math.floor((now - parsed) / 86_400_000)) : 999; }
function percent(part: number, total: number) { return total > 0 ? Math.round((part / total) * 100) : 0; }
function round(value: number) { return Math.round((value + Number.EPSILON) * 100) / 100; }
function riskRank(value: string) { return value === "Yüksek kayıp riski" ? 4 : value === "Takip gerekli" ? 3 : value === "Teklif dönüşümü bekliyor" ? 2 : 1; }
function collectionRank(value: string) { return value === "Limit aşımı" ? 4 : value === "Gecikmiş" ? 3 : value === "Limite yakın" ? 2 : 1; }
