import "server-only";
import { toPublicProduct, type CatalogProductRecord } from "@entas/catalog";
import { loadCatalogStore } from "./catalog-repository";
import { formatMoney, parseMoney, priceProductForCustomer } from "./customer-pricing";
import type { CustomerAccount } from "./customer-auth";

export type SellerStockFilter = "all" | "available" | "low_stock" | "incoming" | "out_of_stock";

export interface SellerCatalogProduct {
  sku: string;
  barcode?: string;
  manufacturerCode?: string;
  name: string;
  brand: string;
  category: string;
  categoryPath: string[];
  unit: string;
  minOrder: number;
  packageQuantity: number;
  cartonQuantity: number;
  currency: string;
  purchasePrice: string | null;
  displayPurchasePrice: string | null;
  taxRate: number;
  taxIncluded: true;
  recommendedSalePrice: string | null;
  displayRecommendedSalePrice: string | null;
  estimatedProfit: string | null;
  stockStatus: string;
  stockLabel: string;
  stockRange: string;
  availableQuantity: number | null;
  exactStock: boolean;
  orderable: boolean;
  imageUrl: string;
  productUrl: string;
  updatedAt: string;
}

export interface SellerCatalogSummary {
  activeProducts: number;
  availableProducts: number;
  lowStockProducts: number;
  incomingProducts: number;
  pricedProducts: number;
  updatedAt: string;
}

export interface SellerCatalogResult {
  total: number;
  limit: number;
  offset: number;
  items: SellerCatalogProduct[];
  summary: SellerCatalogSummary;
}

export async function getSellerCatalog(
  customer: CustomerAccount,
  input: { q?: string; stock?: SellerStockFilter; limit?: number; offset?: number; baseUrl?: string } = {}
): Promise<SellerCatalogResult> {
  const store = await loadCatalogStore();
  const active = store.products.filter(isActiveProduct);
  const q = normalize(input.q ?? "");
  const stock = input.stock ?? "all";
  const filtered = active
    .filter((product) => !q || searchableText(product).includes(q))
    .filter((product) => matchesStock(product, stock))
    .sort(compareProducts);
  const limit = Math.min(10_000, Math.max(1, Math.trunc(input.limit ?? 50)));
  const requestedOffset = Math.max(0, Math.trunc(input.offset ?? 0));
  const offset = requestedOffset >= filtered.length && filtered.length > 0 ? 0 : requestedOffset;

  return {
    total: filtered.length,
    limit,
    offset,
    items: filtered.slice(offset, offset + limit).map((product) => toSellerProduct(product, customer, input.baseUrl)),
    summary: summarize(active, customer, store.updatedAt)
  };
}

export function toSellerProduct(product: CatalogProductRecord, customer: CustomerAccount, baseUrl = ""): SellerCatalogProduct {
  const publicProduct = toPublicProduct(product);
  const price = priceProductForCustomer(product, customer);
  const purchasePrice = price ? parseMoney(price.unitNetPrice) : 0;
  const markupRate = customer.sellerAccess?.defaultMarkupRate ?? 30;
  const recommendedSalePrice = purchasePrice > 0 ? roundMoney(purchasePrice * (1 + markupRate / 100)) : 0;
  const exactStock = Boolean(customer.sellerAccess?.exactStockEnabled && product.stockQuantityKnown !== false);
  const normalizedCurrency = product.currency === "TL" ? "TRY" : product.currency || "TRY";
  const stockQuantity = Number.isFinite(product.stockQuantity) ? Math.max(0, Math.trunc(product.stockQuantity)) : 0;
  const available = product.stockStatus === "in_stock" || product.stockStatus === "low_stock";

  return stripUndefined({
    sku: product.sku,
    barcode: product.barcode,
    manufacturerCode: product.manufacturerCode,
    name: product.name,
    brand: product.brand,
    category: publicProduct.category,
    categoryPath: publicProduct.categoryPath,
    unit: product.unitType,
    minOrder: publicProduct.minOrder,
    packageQuantity: publicProduct.packageQuantity,
    cartonQuantity: publicProduct.cartonQuantity,
    currency: normalizedCurrency,
    purchasePrice: price ? price.unitNetPrice : null,
    displayPurchasePrice: price ? price.displayPrice : null,
    taxRate: Number(product.taxRate.replace(",", ".")) || 0,
    taxIncluded: true,
    recommendedSalePrice: recommendedSalePrice > 0 ? money(recommendedSalePrice) : null,
    displayRecommendedSalePrice: recommendedSalePrice > 0 ? formatMoney(recommendedSalePrice, normalizedCurrency) : null,
    estimatedProfit: recommendedSalePrice > 0 ? money(recommendedSalePrice - purchasePrice) : null,
    stockStatus: product.stockStatus,
    stockLabel: publicProduct.stockLabel,
    stockRange: publicProduct.stockRange,
    availableQuantity: exactStock ? stockQuantity : null,
    exactStock,
    orderable: Boolean(price && purchasePrice > 0 && available && stockQuantity > 0),
    imageUrl: absoluteUrl(publicProduct.image, baseUrl),
    productUrl: absoluteUrl(`/products/${encodeURIComponent(product.slug)}`, baseUrl),
    updatedAt: product.updatedAt
  }) as SellerCatalogProduct;
}

export function serializeSellerProductsCsv(products: SellerCatalogProduct[]): string {
  const columns: Array<[string, (product: SellerCatalogProduct) => unknown]> = [
    ["sku", (p) => p.sku],
    ["barcode", (p) => p.barcode ?? ""],
    ["manufacturer_code", (p) => p.manufacturerCode ?? ""],
    ["name", (p) => p.name],
    ["brand", (p) => p.brand],
    ["category", (p) => p.category],
    ["unit", (p) => p.unit],
    ["min_order", (p) => p.minOrder],
    ["package_quantity", (p) => p.packageQuantity],
    ["carton_quantity", (p) => p.cartonQuantity],
    ["purchase_price_vat_included", (p) => p.purchasePrice ?? ""],
    ["currency", (p) => p.currency],
    ["tax_rate", (p) => p.taxRate],
    ["stock_status", (p) => p.stockStatus],
    ["available_quantity", (p) => p.availableQuantity ?? ""],
    ["stock_range", (p) => p.stockRange],
    ["orderable", (p) => p.orderable],
    ["image_url", (p) => p.imageUrl],
    ["product_url", (p) => p.productUrl],
    ["updated_at", (p) => p.updatedAt]
  ];
  return [
    columns.map(([name]) => csvCell(name)).join(","),
    ...products.map((product) => columns.map(([, read]) => csvCell(read(product))).join(","))
  ].join("\n") + "\n";
}

export function serializeSellerProductsXml(products: SellerCatalogProduct[], generatedAt = new Date().toISOString()): string {
  const rows = products.map((product) => `  <product>
    <sku>${xml(product.sku)}</sku>
    <barcode>${xml(product.barcode ?? "")}</barcode>
    <manufacturerCode>${xml(product.manufacturerCode ?? "")}</manufacturerCode>
    <name>${xml(product.name)}</name>
    <brand>${xml(product.brand)}</brand>
    <category>${xml(product.category)}</category>
    <unit>${xml(product.unit)}</unit>
    <minOrder>${product.minOrder}</minOrder>
    <purchasePrice vatIncluded="true" currency="${xml(product.currency)}">${xml(product.purchasePrice ?? "")}</purchasePrice>
    <taxRate>${product.taxRate}</taxRate>
    <stock status="${xml(product.stockStatus)}" exact="${product.exactStock}">${xml(product.availableQuantity ?? product.stockRange)}</stock>
    <orderable>${product.orderable}</orderable>
    <imageUrl>${xml(product.imageUrl)}</imageUrl>
    <productUrl>${xml(product.productUrl)}</productUrl>
    <updatedAt>${xml(product.updatedAt)}</updatedAt>
  </product>`).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<catalog generatedAt="${xml(generatedAt)}" productCount="${products.length}">\n${rows}\n</catalog>\n`;
}

function summarize(products: CatalogProductRecord[], customer: CustomerAccount, updatedAt: string): SellerCatalogSummary {
  return {
    activeProducts: products.length,
    availableProducts: products.filter((product) => matchesStock(product, "available")).length,
    lowStockProducts: products.filter((product) => product.stockStatus === "low_stock").length,
    incomingProducts: products.filter((product) => product.stockStatus === "incoming").length,
    pricedProducts: products.filter((product) => Boolean(priceProductForCustomer(product, customer))).length,
    updatedAt
  };
}

function isActiveProduct(product: CatalogProductRecord): boolean {
  return product.status === "ACTIVE" && product.isVisible;
}

function matchesStock(product: CatalogProductRecord, filter: SellerStockFilter): boolean {
  if (filter === "all") return true;
  if (filter === "available") return (product.stockStatus === "in_stock" || product.stockStatus === "low_stock") && product.stockQuantity > 0;
  return product.stockStatus === filter;
}

function compareProducts(left: CatalogProductRecord, right: CatalogProductRecord): number {
  const leftAvailable = matchesStock(left, "available") ? 1 : 0;
  const rightAvailable = matchesStock(right, "available") ? 1 : 0;
  return rightAvailable - leftAvailable || left.brand.localeCompare(right.brand, "tr") || left.name.localeCompare(right.name, "tr");
}

function searchableText(product: CatalogProductRecord): string {
  return normalize([product.sku, product.barcode ?? "", product.manufacturerCode ?? "", product.name, product.brand, product.category].join(" "));
}

function normalize(value: string): string {
  return value.trim().toLocaleLowerCase("tr-TR").replace(/[ç]/g, "c").replace(/[ğ]/g, "g").replace(/[ı]/g, "i").replace(/[ö]/g, "o").replace(/[ş]/g, "s").replace(/[ü]/g, "u");
}

function absoluteUrl(value: string, baseUrl: string): string {
  if (!baseUrl || /^https?:\/\//i.test(value)) return value;
  return `${baseUrl.replace(/\/$/, "")}${value.startsWith("/") ? value : `/${value}`}`;
}

function money(value: number): string {
  return roundMoney(value).toFixed(2);
}

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function csvCell(value: unknown): string {
  const raw = String(value ?? "");
  const text = /^[=+\-@]/.test(raw) ? `'${raw}` : raw;
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function xml(value: unknown): string {
  return String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

function stripUndefined<T>(value: T): T {
  if (Array.isArray(value)) return value.map(stripUndefined) as T;
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).filter(([, entry]) => entry !== undefined)) as T;
  }
  return value;
}
