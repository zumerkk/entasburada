import "server-only";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  CATALOG_TREE,
  brandsFromStore,
  categoriesFromStore,
  catalogGroupCount,
  classifyCatalogProduct,
  createEmptyCatalogStore,
  createImportAudit,
  mergeImportedProducts,
  publishProducts,
  searchCatalogRecords,
  sourcesFromStore,
  toAdminProduct,
  toPublicProduct,
  uncategorizedProductCount,
  type AdminCatalogProduct,
  type AuditLogEntry,
  type CatalogSearchFilters,
  type CatalogSearchResult,
  type CatalogStore,
  type CatalogGroupDefinition,
  type ImportedSupplierProduct,
  type PublicCatalogProduct
} from "@entas/catalog";
import type { CustomerAccount } from "./customer-auth";
import { priceProductForCustomer } from "./customer-pricing";

interface ImportReport {
  generatedAt: string;
  sources: Array<{
    key: string;
    name: string;
    path: string;
    url?: string;
    totalRows: number;
    acceptedRows: number;
    issueCount: number;
  }>;
  totals: {
    products: number;
    inStock: number;
    lowStock: number;
    outOfStock: number;
    pricedRows: number;
    zeroPriceRows: number;
    duplicateSkuCount: number;
    duplicateBarcodeCount: number;
  };
}

export interface CatalogFacets {
  categories: string[];
  brands: string[];
  sources: Array<{ key: string; name: string; count: number }>;
}

export interface CatalogNavigationItem {
  label: string;
  slug: string;
  href: string;
  count: number;
}

export interface PublicProductFilters extends CatalogSearchFilters {
  categoryGroup?: string;
  view?: string;
}

export interface PricedPublicCatalogProduct extends PublicCatalogProduct {
  price?: string;
  listPrice?: string;
  discountRate?: string;
  priceRuleLabel?: string;
}

const rootDir = findWorkspaceRoot(process.cwd());
const dataDir = path.join(rootDir, "data");
const catalogNavigationGroups: CatalogGroupDefinition[] = [
  {
    slug: "tum-urunler",
    label: "Tüm Ürünler",
    aliases: [],
    keywords: ["*"]
  },
  ...CATALOG_TREE.map((category) => ({
    slug: category.slug,
    label: category.label,
    aliases: [],
    keywords: category.keywords
  }))
];
const importProductsPath = path.join(dataDir, "import-results", "supplier-products.json");
const importReportPath = path.join(dataDir, "import-results", "import-report.json");
const catalogStorePath = path.join(dataDir, "catalog-store.json");
const auditLogPath = path.join(dataDir, "audit-log.json");

export async function loadCatalogStore(): Promise<CatalogStore> {
  const now = new Date().toISOString();
  const fallback = createEmptyCatalogStore(now);
  const store = await readJson<CatalogStore>(catalogStorePath, fallback);

  if (store.products.length > 0 || !existsSync(importProductsPath)) {
    return store;
  }

  return syncImportedProducts({ publishNew: false, actor: "system-bootstrap" });
}

export async function syncImportedProducts({ publishNew = false, actor = "admin@entasburada.com" }: { publishNew?: boolean; actor?: string } = {}): Promise<CatalogStore> {
  const now = new Date().toISOString();
  const importedProducts = await readJson<ImportedSupplierProduct[]>(importProductsPath, []);
  const existingStore = await readJson<CatalogStore>(catalogStorePath, createEmptyCatalogStore(now));
  const mergedStore = mergeImportedProducts(existingStore, importedProducts, now);
  const auditLogs: AuditLogEntry[] = [createImportAudit(importedProducts.length, actor, now)];

  let nextStore = mergedStore;
  if (publishNew) {
    const publishIds = mergedStore.products
      .filter((product) => product.status !== "ACTIVE" || !product.isVisible)
      .map((product) => product.id);
    const publishResult = publishProducts(mergedStore, publishIds, actor, now);
    nextStore = publishResult.store;
    auditLogs.push(...publishResult.auditLogs);
  }

  await saveCatalogStore(nextStore);
  await appendAuditLogs(auditLogs);
  return nextStore;
}

export async function publishDraftProducts(actor = "admin@entasburada.com"): Promise<CatalogStore> {
  const store = await loadCatalogStore();
  const ids = store.products
    .filter((product) => product.status !== "ACTIVE" || !product.isVisible)
    .map((product) => product.id);
  const result = publishProducts(store, ids, actor);
  await saveCatalogStore(result.store);
  await appendAuditLogs(result.auditLogs);
  return result.store;
}

export async function publishProductIds(ids: string[], actor = "admin@entasburada.com"): Promise<CatalogStore> {
  const store = await loadCatalogStore();
  const result = publishProducts(store, ids, actor);
  await saveCatalogStore(result.store);
  await appendAuditLogs(result.auditLogs);
  return result.store;
}

export async function getPublicProducts(filters: PublicProductFilters = {}): Promise<CatalogSearchResult<PublicCatalogProduct>> {
  const startedAt = Date.now();
  const store = await loadCatalogStore();
  const result = searchCatalogRecords(store, { ...filters, publicOnly: true, allowCategoryFallback: true });
  logCatalogQuery(filters, result.total, Date.now() - startedAt);
  return { ...result, items: result.items.map(toPublicProduct) };
}

export async function getPricedPublicProducts(
  filters: PublicProductFilters = {},
  customer: CustomerAccount | null
): Promise<CatalogSearchResult<PricedPublicCatalogProduct>> {
  const startedAt = Date.now();
  const store = await loadCatalogStore();
  const result = searchCatalogRecords(store, { ...filters, publicOnly: true, allowCategoryFallback: true });
  logCatalogQuery(filters, result.total, Date.now() - startedAt);

  return {
    ...result,
    items: result.items.map((product) => {
      const publicProduct: PricedPublicCatalogProduct = toPublicProduct(product);
      const price = customer ? priceProductForCustomer(product, customer) : null;
      if (!price) {
        return publicProduct;
      }

      return {
        ...publicProduct,
        price: price.displayPrice,
        listPrice: price.listPrice,
        discountRate: price.discountRate,
        priceRuleLabel: price.ruleLabel
      };
    })
  };
}

export async function getAdminProducts(filters: CatalogSearchFilters = {}): Promise<CatalogSearchResult<AdminCatalogProduct>> {
  const store = await loadCatalogStore();
  const result = searchCatalogRecords(store, filters);
  return { ...result, items: result.items.map(toAdminProduct) };
}

export async function getPublicProductBySlug(slug: string): Promise<PublicCatalogProduct | null> {
  const store = await loadCatalogStore();
  const product = store.products.find((item) => item.slug === slug && item.status === "ACTIVE" && item.isVisible);
  return product ? toPublicProduct(product) : null;
}

export async function getPricedPublicProductBySlug(slug: string, customer: CustomerAccount | null): Promise<PricedPublicCatalogProduct | null> {
  const store = await loadCatalogStore();
  const product = store.products.find((item) => item.slug === slug && item.status === "ACTIVE" && item.isVisible);
  if (!product) {
    return null;
  }

  const publicProduct: PricedPublicCatalogProduct = toPublicProduct(product);
  const price = customer ? priceProductForCustomer(product, customer) : null;
  if (!price) {
    return publicProduct;
  }

  return {
    ...publicProduct,
    price: price.displayPrice,
    listPrice: price.listPrice,
    discountRate: price.discountRate,
    priceRuleLabel: price.ruleLabel
  };
}

export async function getCatalogFacets(publicOnly = true): Promise<CatalogFacets> {
  const store = await loadCatalogStore();
  const facetStore: CatalogStore = publicOnly
    ? { ...store, products: store.products.filter((product) => product.status === "ACTIVE" && product.isVisible) }
    : store;

  return {
    categories: categoriesFromStore(facetStore),
    brands: brandsFromStore(facetStore),
    sources: sourcesFromStore(facetStore)
  };
}

export async function getCatalogNavigation(): Promise<CatalogNavigationItem[]> {
  const store = await loadCatalogStore();
  return catalogNavigationGroups.map((group) => ({
    label: group.label,
    slug: group.slug,
    href: group.slug === "tum-urunler" ? "/catalog" : `/catalog?group=${encodeURIComponent(group.slug)}`,
    count: catalogGroupCount(store, group, true)
  })).filter((item) => item.slug === "tum-urunler" || item.count > 0);
}

export interface CatalogTreeNavLeaf {
  slug: string;
  label: string;
  href: string;
}

export interface CatalogTreeNavColumn {
  heading: string;
  items: CatalogTreeNavLeaf[];
}

export interface CatalogTreeNavCategory {
  slug: string;
  label: string;
  icon: string;
  count: number;
  href: string;
  columns: CatalogTreeNavColumn[];
}

export async function getCatalogTree(): Promise<CatalogTreeNavCategory[]> {
  const store = await loadCatalogStore();
  return CATALOG_TREE.map((category) => ({
    slug: category.slug,
    label: category.label,
    icon: category.icon,
    count: catalogGroupCount(store, { slug: category.slug, label: category.label, aliases: [], keywords: category.keywords }, true),
    href: `/catalog?group=${encodeURIComponent(category.slug)}`,
    columns: category.columns.map((column) => ({
      heading: column.heading,
      items: column.items.map((item) => ({
        slug: item.slug,
        label: item.label,
        href: `/catalog?group=${encodeURIComponent(item.slug)}`
      }))
    }))
  })).filter((category) => category.count > 0);
}

export async function getCategoryMappingMetrics() {
  const store = await loadCatalogStore();
  const navigation = await getCatalogNavigation();
  const categoryCounts = new Map<string, number>();
  for (const product of store.products) {
    if (product.status !== "ACTIVE" || !product.isVisible) {
      continue;
    }

    const category = classifyCatalogProduct(product).categoryLabel;
    categoryCounts.set(category, (categoryCounts.get(category) ?? 0) + 1);
  }
  const sourceCategories = [...categoryCounts.entries()]
    .map(([category, count]) => ({ category, count }))
    .sort((a, b) => a.category.localeCompare(b.category, "tr"));

  return {
    navigation,
    sourceCategories,
    uncategorizedCount: uncategorizedProductCount(store),
    emptyNavigationCount: catalogNavigationGroups.filter((group) => group.slug !== "tum-urunler" && catalogGroupCount(store, group, true) === 0).length
  };
}

export async function getCatalogOverview() {
  const [store, auditLogs, importReport] = await Promise.all([loadCatalogStore(), loadAuditLog(), loadImportReport()]);
  return { store, auditLogs, importReport };
}

export async function loadImportReport(): Promise<ImportReport | null> {
  return readJson<ImportReport | null>(importReportPath, null);
}

export async function loadAuditLog(): Promise<AuditLogEntry[]> {
  return readJson<AuditLogEntry[]>(auditLogPath, []);
}

export function formatCatalogMoney(value: string, currency: string): string {
  const amount = Number(value.replace(",", "."));
  const safeAmount = Number.isFinite(amount) ? amount : 0;
  const normalizedCurrency = currency === "TL" ? "TRY" : currency;

  return new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency: normalizedCurrency || "TRY",
    maximumFractionDigits: 2
  }).format(safeAmount);
}

function logCatalogQuery(filters: PublicProductFilters, total: number, durationMs: number): void {
  if (process.env.NODE_ENV === "production") {
    return;
  }

  console.info("[catalog-query]", {
    total,
    filters: {
      q: filters.q,
      category: filters.category,
      categoryGroup: filters.categoryGroup,
      view: filters.view,
      brand: filters.brand,
      sourceKey: filters.sourceKey,
      stockStatus: filters.stockStatus,
      limit: filters.limit,
      offset: filters.offset
    },
    durationMs
  });
}

export async function saveCatalogStore(store: CatalogStore): Promise<void> {
  await writeJson(catalogStorePath, store);
}

export async function appendAuditLogs(logs: AuditLogEntry[]): Promise<void> {
  if (logs.length === 0) {
    return;
  }

  const existingAudit = await loadAuditLog();
  await writeJson(auditLogPath, [...logs, ...existingAudit].slice(0, 1000));
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
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`);
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
  return (
    existsSync(path.join(dir, "pnpm-workspace.yaml")) ||
    existsSync(path.join(dir, "data", "catalog-store.json")) ||
    existsSync(path.join(dir, "data", "import-results", "supplier-products.json"))
  );
}
