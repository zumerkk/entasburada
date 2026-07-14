import { CATALOG_TREE, flattenCatalogTree } from "./catalog-tree";

export {
  CATALOG_TREE,
  flattenCatalogTree,
  type CatalogTreeCategory,
  type CatalogTreeColumn,
  type CatalogTreeLeaf
} from "./catalog-tree";

export type ProductStatus = "DRAFT" | "ACTIVE" | "PASSIVE";
export type PriceApprovalStatus = "APPROVED" | "NO_PRICE" | "NEEDS_REVIEW";
export type PriceDisplayMode = "HIDDEN_UNTIL_DEALER" | "CONTACT_REP";
export type StockStatus = "in_stock" | "low_stock" | "incoming" | "out_of_stock";

export interface ImportedSupplierProduct {
  sourceKey: string;
  sourceName: string;
  externalId: string;
  sku: string;
  barcode?: string;
  manufacturerCode?: string;
  productName: string;
  brandName: string;
  categoryPath: string[];
  categoryName?: string;
  unitType: string;
  taxRate: string;
  currency: string;
  listPrice: string;
  stockQuantity: number;
  stockStatus: StockStatus;
  stockQuantityKnown?: boolean;
  description?: string;
  technicalSpecs?: Array<{ label: string; value: string }>;
  minOrder?: number;
  packageQuantity?: number;
  cartonQuantity?: number;
  palletQuantity?: number;
  warrantyMonths?: number;
  imageUrl?: string;
  sourceUrl?: string;
  priceVisibleToPublic: false;
}

export interface CatalogProductRecord {
  id: string;
  sourceKey: string;
  sourceName: string;
  externalId: string;
  sku: string;
  slug: string;
  barcode?: string;
  manufacturerCode?: string;
  name: string;
  brand: string;
  categoryPath: string[];
  category: string;
  unitType: string;
  taxRate: string;
  currency: string;
  listPrice: string;
  stockQuantity: number;
  stockStatus: StockStatus;
  stockQuantityKnown?: boolean;
  description?: string;
  technicalSpecs?: Array<{ label: string; value: string }>;
  minOrder?: number;
  packageQuantity?: number;
  cartonQuantity?: number;
  palletQuantity?: number;
  warrantyMonths?: number;
  imageUrl?: string;
  sourceUrl?: string;
  status: ProductStatus;
  isVisible: boolean;
  priceApprovalStatus: PriceApprovalStatus;
  priceDisplayMode: PriceDisplayMode;
  importedAt: string;
  createdAt: string;
  updatedAt: string;
  publishedAt?: string;
  publishedBy?: string;
}

export interface CatalogSummary {
  importedRows: number;
  active: number;
  draft: number;
  passive: number;
  inStock: number;
  lowStock: number;
  incoming: number;
  outOfStock: number;
  priced: number;
  zeroPrice: number;
  sources: Record<string, number>;
}

export interface CatalogStore {
  version: 1;
  updatedAt: string;
  products: CatalogProductRecord[];
  importSummary: CatalogSummary;
}

export type AuditAction = "IMPORT_SYNC" | "PRODUCT_BULK_PUBLISH" | "PRODUCT_PUBLISH" | "PRODUCT_UNPUBLISH";

export interface AuditLogEntry {
  id: string;
  timestamp: string;
  actor: string;
  action: AuditAction;
  entityType: "catalog" | "product";
  entityId?: string;
  message: string;
  metadata?: Record<string, string | number | boolean | null>;
}

export interface PublicCatalogProduct {
  slug: string;
  brand: string;
  name: string;
  sku: string;
  barcode?: string;
  manufacturerCode?: string;
  category: string;
  categoryPath: string[];
  description?: string;
  image: string;
  stockTone: StockStatus;
  stockLabel: string;
  stockQuantityKnown: boolean;
  badges: string[];
  unitType: string;
  minOrder: number;
  packageQuantity: number;
  cartonQuantity: number;
  palletQuantity: number;
  warrantyMonths: number;
  taxRate: number;
  priceDisplayMode: PriceDisplayMode;
  specs: Array<{ label: string; value: string }>;
}

export interface AdminCatalogProduct extends PublicCatalogProduct {
  id: string;
  sourceKey: string;
  sourceName: string;
  externalId: string;
  status: ProductStatus;
  isVisible: boolean;
  listPrice: string;
  currency: string;
  stockQuantity: number;
  priceApprovalStatus: PriceApprovalStatus;
  importedAt: string;
  updatedAt: string;
  publishedAt?: string;
  publishedBy?: string;
}

export interface CatalogSearchFilters {
  q?: string;
  category?: string;
  categoryGroup?: string;
  view?: string;
  brand?: string;
  sourceKey?: string;
  stockStatus?: StockStatus | "all";
  status?: ProductStatus | "all";
  publicOnly?: boolean;
  allowCategoryFallback?: boolean;
  limit?: number;
  offset?: number;
}

export interface CatalogSearchFallback {
  requested: string;
  effective: string;
  message: string;
  reason: "category_alias" | "category_conflict" | "empty_category" | "show_all";
}

export interface CatalogSearchResult<T> {
  total: number;
  limit: number;
  offset: number;
  items: T[];
  fallback?: CatalogSearchFallback;
  appliedCategoryLabel?: string;
}

const FALLBACK_IMAGE = "/images/industrial-hero.png";

export interface CatalogGroupDefinition {
  slug: string;
  label: string;
  aliases: string[];
  keywords: string[];
  fallbackKeywords?: string[];
}

export const CATALOG_GROUPS: CatalogGroupDefinition[] = [
  {
    slug: "tum-urunler",
    label: "Tüm Ürünler",
    aliases: ["ana katalog", "tum urunler", "tüm ürünler", "all"],
    keywords: ["*"]
  },
  {
    slug: "tesisat-baglanti-elemanlari",
    label: "Hırdavat ve Bağlantı Elemanları",
    aliases: ["hirdavat", "hırdavat", "baglanti elemanlari", "bağlantı elemanları", "fittings", "fitting"],
    keywords: ["fitting", "fittings", "fitings", "fiting", "kaplin", "kelepce", "kelepçe", "rekor", "conta", "hirdavat", "hırdavat", "galveniz", "galvaniz", "pprc", "pvc", "siyah fitting", "sari fitting", "sarı fitting"]
  },
  {
    slug: "musluk-batarya",
    label: "Musluklar ve Bataryalar",
    aliases: ["musluk", "musluklar", "batarya", "bataryalar"],
    keywords: ["musluk", "batarya", "tahrat", "aritma muslugu", "arıtma musluğu", "mix kol", "salmastra", "volan"]
  },
  {
    slug: "dus-banyo",
    label: "Duş, Banyo ve Vitrifiye",
    aliases: ["dus", "duş", "banyo", "vitrifiye", "banyo aksesuarlari", "banyo aksesuarları"],
    keywords: ["dus", "duş", "banyo", "vitrifiye", "klozet", "rezervuar", "sifon", "yer sifonu", "gomme rezervuar", "gömme rezervuar"]
  },
  {
    slug: "pompa-su-sistemleri",
    label: "Pompa ve Su Sistemleri",
    aliases: ["pompa", "pompalar", "su sistemleri", "bahce pompasi", "bahçe pompası"],
    keywords: ["pompa", "dalgic", "dalgıç", "hidrofor", "vortex", "santrifuj", "santrifüj", "su pompasi", "su pompası"]
  },
  {
    slug: "hortum-flex",
    label: "Hortum ve Flex",
    aliases: ["hortum", "hortumlar", "flex", "fleks"],
    keywords: ["hortum", "flex", "fleks", "gaz flex", "su flex", "dus hortumu", "duş hortumu"]
  },
  {
    slug: "aksesuar-yedek-parca",
    label: "Aksesuar ve Yedek Parça",
    aliases: ["aksesuar", "aksesuarlar", "yedek parca", "yedek parça"],
    keywords: ["aksesuar", "yedek parca", "yedek parça", "aparat", "kapak", "kol", "conta", "ic takim", "iç takım", "uzatma"]
  },
  {
    slug: "el-aletleri",
    label: "El Aletleri",
    aliases: ["el aletleri", "alet", "aletler"],
    keywords: ["el aleti", "alet", "anahtar", "hirdavat", "hırdavat", "kriko"],
    fallbackKeywords: ["hirdavat", "hırdavat", "aksesuar"]
  },
  {
    slug: "oto-servis-ekipmanlari",
    label: "Oto Servis Ekipmanları",
    aliases: ["oto servis", "oto servis ekipmanlari", "oto servis ekipmanları", "kriko"],
    keywords: ["kriko", "kompresor", "kompresör", "aku", "akü", "timsah", "sise kriko", "şişe kriko"],
    fallbackKeywords: ["hirdavat", "hırdavat"]
  },
  {
    slug: "bahce-tarim",
    label: "Bahçe ve Tarım",
    aliases: ["bahce", "bahçe", "tarim", "tarım"],
    keywords: ["bahce", "bahçe", "tarim", "tarım", "pompa", "hortum"],
    fallbackKeywords: ["pompa", "hortum"]
  },
  {
    slug: "elektrikli-el-aletleri",
    label: "Elektrikli El Aletleri",
    aliases: ["elektrikli el aletleri", "matkap", "taslama", "taşlama", "spiral"],
    keywords: ["matkap", "taslama", "taşlama", "spiral", "dekupaj", "vidalama", "freze", "delici", "kirici", "kırıcı"],
    fallbackKeywords: ["hirdavat", "hırdavat"]
  },
  {
    slug: "is-guvenligi",
    label: "İş Güvenliği",
    aliases: ["is guvenligi", "iş güvenliği", "guvenlik", "güvenlik"],
    keywords: ["eldiven", "maske", "baret", "gozluk", "gözlük", "guvenlik", "güvenlik"],
    fallbackKeywords: ["hirdavat", "hırdavat"]
  },
  {
    slug: "kampanyali-urunler",
    label: "Kampanyalı Ürünler",
    aliases: ["kampanya", "kampanyalar", "kampanyali urunler", "kampanyalı ürünler"],
    keywords: ["*"]
  },
  {
    slug: "yeni-urunler",
    label: "Yeni Ürünler",
    aliases: ["yeni", "yeni urunler", "yeni ürünler"],
    keywords: ["*"]
  },
  {
    slug: "cok-satanlar",
    label: "Çok Satanlar",
    aliases: ["cok satan", "çok satan", "cok satanlar", "çok satanlar"],
    keywords: ["*"]
  }
];

export function createEmptyCatalogStore(now = new Date().toISOString()): CatalogStore {
  return {
    version: 1,
    updatedAt: now,
    products: [],
    importSummary: createSummary([])
  };
}

export function mergeImportedProducts(store: CatalogStore, importedProducts: ImportedSupplierProduct[], now = new Date().toISOString()): CatalogStore {
  const existingByKey = new Map(store.products.map((product) => [recordImportKey(product), product]));
  const nextProducts: CatalogProductRecord[] = [];
  const seenKeys = new Set<string>();
  const seenSlugs = new Set<string>();

  for (const product of store.products) {
    seenSlugs.add(product.slug);
  }

  for (const imported of importedProducts) {
    const key = importedKey(imported);
    const existing = existingByKey.get(key);
    const slug = existing?.slug ?? uniqueSlug(slugify(`${imported.productName}-${imported.sku}`), seenSlugs);
    seenKeys.add(key);
    nextProducts.push(toCatalogRecord(imported, now, slug, existing));
  }

  for (const product of store.products) {
    if (!seenKeys.has(recordImportKey(product))) {
      nextProducts.push({ ...product, updatedAt: now });
    }
  }

  return {
    version: 1,
    updatedAt: now,
    products: nextProducts,
    importSummary: createSummary(nextProducts)
  };
}

export function publishProducts(store: CatalogStore, ids: string[], actor: string, now = new Date().toISOString()): { store: CatalogStore; auditLogs: AuditLogEntry[] } {
  const idSet = new Set(ids);
  let changed = 0;

  const products = store.products.map((product) => {
    if (!idSet.has(product.id)) {
      return product;
    }

    changed += product.status === "ACTIVE" && product.isVisible ? 0 : 1;

    return stripUndefined({
      ...product,
      status: "ACTIVE" as const,
      isVisible: true,
      updatedAt: now,
      publishedAt: product.publishedAt ?? now,
      publishedBy: product.publishedBy ?? actor
    }) as CatalogProductRecord;
  });

  const nextStore: CatalogStore = {
    version: 1,
    updatedAt: now,
    products,
    importSummary: createSummary(products)
  };

  if (changed === 0) {
    return { store: nextStore, auditLogs: [] };
  }

  return {
    store: nextStore,
    auditLogs: [
      {
        id: auditId("publish", now, ids.length),
        timestamp: now,
        actor,
        action: ids.length === 1 ? "PRODUCT_PUBLISH" : "PRODUCT_BULK_PUBLISH",
        entityType: ids.length === 1 ? "product" : "catalog",
        ...(ids.length === 1 && ids[0] ? { entityId: ids[0] } : {}),
        message: `${changed.toLocaleString("tr-TR")} ürün yayına alındı.`,
        metadata: { requestedCount: ids.length, changedCount: changed }
      }
    ]
  };
}

export function searchCatalogRecords(store: CatalogStore, filters: CatalogSearchFilters = {}): CatalogSearchResult<CatalogProductRecord> {
  const requestedOffset = Math.max(0, filters.offset ?? 0);
  const limit = Math.min(Math.max(1, filters.limit ?? 24), 200);
  const term = normalizeSearch(filters.q ?? "");
  const category = normalizeSearch(filters.category ?? "");
  const categoryGroup = resolveCatalogGroup(filters.categoryGroup ?? filters.view ?? "");
  const categoryAliasGroup = !categoryGroup && category ? resolveCatalogGroup(filters.category ?? "") : undefined;
  const brand = normalizeSearch(filters.brand ?? "");
  const sourceKey = normalizeSearch(filters.sourceKey ?? "");

  const withoutCategory = store.products.filter((product) => {
    if (filters.publicOnly && (product.status !== "ACTIVE" || !product.isVisible)) {
      return false;
    }

    if (filters.status && filters.status !== "all" && product.status !== filters.status) {
      return false;
    }

    if (filters.stockStatus && filters.stockStatus !== "all" && product.stockStatus !== filters.stockStatus) {
      return false;
    }

    if (sourceKey && normalizeSearch(product.sourceKey) !== sourceKey) {
      return false;
    }

    if (brand && normalizeSearch(product.brand) !== brand) {
      return false;
    }

    if (!term) {
      return true;
    }

    return [product.name, product.brand, product.sku, product.barcode ?? "", product.manufacturerCode ?? "", product.category]
      .map(normalizeSearch)
      .some((entry) => entry.includes(term));
  });

  const categoryFiltered = applyCategoryFilters(withoutCategory, category, categoryGroup);
  let filtered = categoryFiltered.items;
  let fallback = categoryFiltered.fallback;
  const requestedCategory = filters.categoryGroup ?? filters.category ?? filters.view ?? "";

  if (filtered.length === 0 && filters.allowCategoryFallback && requestedCategory) {
    if (withoutCategory.length > 0 && term) {
      filtered = withoutCategory;
      fallback = {
        requested: requestedCategory,
        effective: "arama-sonuclari",
        message: "Kategori filtresi arama sonucu ile eşleşmedi, arama ile bulunan ürünleri gösteriyoruz.",
        reason: "category_conflict"
      };
    } else {
      const fallbackGroup = categoryGroup ?? categoryAliasGroup;
      const fallbackByKeyword = fallbackGroup
        ? withoutCategory.filter((product) => productMatchesCatalogGroup(product, fallbackGroup, true))
        : [];

      if (fallbackByKeyword.length > 0) {
        filtered = fallbackByKeyword;
        fallback = {
          requested: requestedCategory,
          effective: fallbackGroup?.slug ?? requestedCategory,
          message: "Bu kategoride doğrudan ürün bulunamadı, ilgili ürünleri gösteriyoruz.",
          reason: "category_alias"
        };
      } else {
        filtered = withoutCategory;
        fallback = {
          requested: requestedCategory,
          effective: "tum-urunler",
          message: "Bu kategoride doğrudan ürün bulunamadı, tüm aktif ürünleri gösteriyoruz.",
          reason: "show_all"
        };
      }
    }
  }

  const offset = requestedOffset >= filtered.length && filtered.length > 0 ? 0 : requestedOffset;

  return {
    total: filtered.length,
    limit,
    offset,
    items: filtered.slice(offset, offset + limit),
    ...(fallback ? { fallback } : {}),
    ...(categoryGroup ? { appliedCategoryLabel: categoryGroup.label } : category ? { appliedCategoryLabel: filters.category } : {})
  };
}

export function toPublicProduct(product: CatalogProductRecord): PublicCatalogProduct {
  const specs = stripEmptySpecs([
    ...(product.technicalSpecs ?? []),
    { label: "Birim", value: product.unitType },
    { label: "Kategori", value: product.category },
    { label: "Marka", value: product.brand },
    { label: "Barkod", value: product.barcode ?? "" },
    { label: "Üretici kodu", value: product.manufacturerCode ?? "" }
  ]);

  return stripUndefined({
    slug: product.slug,
    brand: product.brand,
    name: product.name,
    sku: product.sku,
    barcode: product.barcode,
    manufacturerCode: product.manufacturerCode,
    category: product.category,
    categoryPath: product.categoryPath,
    description: product.description,
    image: product.imageUrl ?? FALLBACK_IMAGE,
    stockTone: product.stockStatus,
    stockLabel: stockLabel(product.stockStatus, product.stockQuantityKnown !== false),
    stockQuantityKnown: product.stockQuantityKnown !== false,
    badges: product.priceDisplayMode === "CONTACT_REP" ? [product.sourceName, "Temsilci fiyatı"] : [product.sourceName],
    unitType: product.unitType,
    minOrder: positiveInteger(product.minOrder, 1),
    packageQuantity: positiveInteger(product.packageQuantity, 1),
    cartonQuantity: positiveInteger(product.cartonQuantity, 1),
    palletQuantity: positiveInteger(product.palletQuantity, 1),
    warrantyMonths: nonNegativeInteger(product.warrantyMonths, 0),
    taxRate: toNumber(product.taxRate),
    priceDisplayMode: product.priceDisplayMode,
    specs
  }) as PublicCatalogProduct;
}

export function toAdminProduct(product: CatalogProductRecord): AdminCatalogProduct {
  return stripUndefined({
    ...toPublicProduct(product),
    id: product.id,
    sourceKey: product.sourceKey,
    sourceName: product.sourceName,
    externalId: product.externalId,
    status: product.status,
    isVisible: product.isVisible,
    listPrice: product.listPrice,
    currency: product.currency,
    stockQuantity: product.stockQuantity,
    priceApprovalStatus: product.priceApprovalStatus,
    importedAt: product.importedAt,
    updatedAt: product.updatedAt,
    publishedAt: product.publishedAt,
    publishedBy: product.publishedBy
  }) as AdminCatalogProduct;
}

export function categoriesFromStore(store: CatalogStore): string[] {
  return uniqueSorted(store.products.map((product) => product.category).filter(Boolean));
}

export function brandsFromStore(store: CatalogStore): string[] {
  return uniqueSorted(store.products.map((product) => product.brand).filter(Boolean));
}

export function sourcesFromStore(store: CatalogStore): Array<{ key: string; name: string; count: number }> {
  const byKey = new Map<string, { key: string; name: string; count: number }>();

  for (const product of store.products) {
    const existing = byKey.get(product.sourceKey);
    if (existing) {
      existing.count += 1;
    } else {
      byKey.set(product.sourceKey, { key: product.sourceKey, name: product.sourceName, count: 1 });
    }
  }

  return Array.from(byKey.values()).sort((a, b) => a.name.localeCompare(b.name, "tr"));
}

let treeGroupCache: CatalogGroupDefinition[] | undefined;

export function catalogTreeGroups(): CatalogGroupDefinition[] {
  if (!treeGroupCache) {
    treeGroupCache = flattenCatalogTree().map((leaf) => ({
      slug: leaf.slug,
      label: leaf.label,
      aliases: [],
      keywords: leaf.keywords
    }));
  }
  return treeGroupCache;
}

export function resolveCatalogGroup(value: string): CatalogGroupDefinition | undefined {
  const normalized = normalizeSearch(value);
  if (!normalized) {
    return undefined;
  }

  // Ağaç düğümleri önce gelir: çakışan slug'larda (ör. musluk-batarya) ağaç kazanır.
  const groupCandidates = [...catalogTreeGroups(), ...CATALOG_GROUPS].map((group) => ({
    group,
    candidates: [group.slug, group.label, ...group.aliases].map(normalizeSearch)
  }));

  const exact = groupCandidates.find(({ candidates }) => candidates.includes(normalized));
  if (exact) {
    return exact.group;
  }

  return groupCandidates.find(({ candidates }) => candidates.some((candidate) => candidate && normalized.includes(candidate)))?.group;
}

export function productMatchesCatalogGroup(product: CatalogProductRecord, group: CatalogGroupDefinition, includeFallback = false): boolean {
  if (group.keywords.includes("*")) {
    return true;
  }

  const keywords = includeFallback ? [...group.keywords, ...(group.fallbackKeywords ?? [])] : group.keywords;
  return productMatchesKeywords(product, keywords);
}

export function catalogGroupCount(store: CatalogStore, group: CatalogGroupDefinition, publicOnly = true): number {
  return store.products.filter((product) => {
    if (publicOnly && (product.status !== "ACTIVE" || !product.isVisible)) {
      return false;
    }

    return productMatchesCatalogGroup(product, group, true);
  }).length;
}

export function uncategorizedProductCount(store: CatalogStore): number {
  return store.products.filter((product) => product.category.trim() === "" || product.categoryPath.length === 0).length;
}

export function createImportAudit(productCount: number, actor: string, now = new Date().toISOString()): AuditLogEntry {
  return {
    id: auditId("sync", now, productCount),
    timestamp: now,
    actor,
    action: "IMPORT_SYNC",
    entityType: "catalog",
    message: `${productCount.toLocaleString("tr-TR")} ithal ürün katalog deposuna senkronize edildi.`,
    metadata: { productCount }
  };
}

export function slugify(value: string): string {
  const turkishMap: Record<string, string> = {
    ç: "c",
    Ç: "c",
    ğ: "g",
    Ğ: "g",
    ı: "i",
    I: "i",
    İ: "i",
    ö: "o",
    Ö: "o",
    ş: "s",
    Ş: "s",
    ü: "u",
    Ü: "u"
  };

  const normalized = value
    .split("")
    .map((char) => turkishMap[char] ?? char)
    .join("")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return normalized || "urun";
}

function toCatalogRecord(imported: ImportedSupplierProduct, now: string, slug: string, existing?: CatalogProductRecord): CatalogProductRecord {
  const hasPrice = toNumber(imported.listPrice) > 0;
  const category = imported.categoryName ?? imported.categoryPath.at(-1) ?? "Genel";

  return stripUndefined({
    id: existing?.id ?? `supplier:${slugify(imported.sourceKey)}:${slugify(imported.externalId || imported.sku)}`,
    sourceKey: imported.sourceKey,
    sourceName: imported.sourceName,
    externalId: imported.externalId,
    sku: imported.sku,
    slug,
    barcode: imported.barcode,
    manufacturerCode: imported.manufacturerCode,
    name: imported.productName,
    brand: imported.brandName,
    categoryPath: imported.categoryPath.length ? imported.categoryPath : [category],
    category,
    unitType: imported.unitType,
    taxRate: imported.taxRate,
    currency: imported.currency,
    listPrice: imported.listPrice,
    stockQuantity: imported.stockQuantity,
    stockStatus: imported.stockStatus,
    stockQuantityKnown: imported.stockQuantityKnown,
    description: imported.description,
    technicalSpecs: imported.technicalSpecs,
    minOrder: imported.minOrder,
    packageQuantity: imported.packageQuantity,
    cartonQuantity: imported.cartonQuantity,
    palletQuantity: imported.palletQuantity,
    warrantyMonths: imported.warrantyMonths,
    imageUrl: imported.imageUrl,
    sourceUrl: imported.sourceUrl,
    status: existing?.status ?? "DRAFT",
    isVisible: existing?.isVisible ?? false,
    priceApprovalStatus: hasPrice ? "APPROVED" : "NO_PRICE",
    priceDisplayMode: hasPrice ? "HIDDEN_UNTIL_DEALER" : "CONTACT_REP",
    importedAt: now,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    publishedAt: existing?.publishedAt,
    publishedBy: existing?.publishedBy
  }) as CatalogProductRecord;
}

function createSummary(products: CatalogProductRecord[]): CatalogSummary {
  const sources: Record<string, number> = {};

  for (const product of products) {
    sources[product.sourceKey] = (sources[product.sourceKey] ?? 0) + 1;
  }

  return {
    importedRows: products.length,
    active: products.filter((product) => product.status === "ACTIVE" && product.isVisible).length,
    draft: products.filter((product) => product.status === "DRAFT").length,
    passive: products.filter((product) => product.status === "PASSIVE").length,
    inStock: products.filter((product) => product.stockStatus === "in_stock").length,
    lowStock: products.filter((product) => product.stockStatus === "low_stock").length,
    incoming: products.filter((product) => product.stockStatus === "incoming").length,
    outOfStock: products.filter((product) => product.stockStatus === "out_of_stock").length,
    priced: products.filter((product) => toNumber(product.listPrice) > 0).length,
    zeroPrice: products.filter((product) => toNumber(product.listPrice) <= 0).length,
    sources
  };
}

function stockLabel(status: StockStatus, quantityKnown = true): string {
  if (!quantityKnown) {
    return "Stok teyidi gerekli";
  }
  if (status === "in_stock") {
    return "Stokta";
  }

  if (status === "low_stock") {
    return "Az stok";
  }

  if (status === "incoming") {
    return "Tedarik sürecinde";
  }

  return "Stok yok";
}

function importedKey(product: ImportedSupplierProduct): string {
  return `${product.sourceKey}:${product.externalId || product.sku}`;
}

function recordImportKey(product: CatalogProductRecord): string {
  return `${product.sourceKey}:${product.externalId || product.sku}`;
}

function uniqueSlug(base: string, seen: Set<string>): string {
  let candidate = base;
  let index = 2;

  while (seen.has(candidate)) {
    candidate = `${base}-${index}`;
    index += 1;
  }

  seen.add(candidate);
  return candidate;
}

function normalizeSearch(value: string): string {
  return value.trim() === "" ? "" : slugify(value).replace(/-/g, " ");
}

function applyCategoryFilters(
  products: CatalogProductRecord[],
  category: string,
  categoryGroup: CatalogGroupDefinition | undefined
): { items: CatalogProductRecord[]; fallback?: CatalogSearchFallback } {
  if (categoryGroup) {
    if (categoryGroup.keywords.includes("*")) {
      return { items: products };
    }

    const directMatches = products.filter((product) => productMatchesCatalogGroup(product, categoryGroup));
    const fallbackMatches = products.filter((product) => productMatchesCatalogGroup(product, categoryGroup, true));
    if (directMatches.length > 0) {
      return { items: fallbackMatches };
    }

    if (fallbackMatches.length === 0) {
      return { items: fallbackMatches };
    }

    return {
      items: fallbackMatches,
      fallback: {
        requested: categoryGroup.label,
        effective: categoryGroup.slug,
        message: "Bu kategoride doğrudan ürün bulunamadı, ilgili ürünleri gösteriyoruz.",
        reason: "category_alias"
      }
    };
  }

  if (!category) {
    return { items: products };
  }

  const directMatches = products.filter((product) => productMatchesCategory(product, category));
  if (directMatches.length > 0) {
    return { items: directMatches };
  }

  const aliasGroup = resolveCatalogGroup(category);
  if (!aliasGroup) {
    return { items: [] };
  }

  const aliasMatches = products.filter((product) => productMatchesCatalogGroup(product, aliasGroup, true));
  if (aliasMatches.length === 0) {
    return { items: aliasMatches };
  }

  return {
    items: aliasMatches,
    fallback: {
      requested: category,
      effective: aliasGroup.slug,
      message: "Bu kategoride doğrudan ürün bulunamadı, ilgili ürünleri gösteriyoruz.",
      reason: "category_alias"
    }
  };
}

function productMatchesCategory(product: CatalogProductRecord, category: string): boolean {
  const normalizedCategories = [product.category, ...product.categoryPath].map(normalizeSearch);
  return normalizedCategories.some((entry) => entry === category || entry.includes(category) || category.includes(entry));
}

function productMatchesKeywords(product: CatalogProductRecord, keywords: string[]): boolean {
  const haystack = [product.category, ...product.categoryPath, product.name, product.brand, product.sku, product.manufacturerCode ?? ""]
    .map(normalizeSearch)
    .join(" ");

  return keywords.map(normalizeSearch).filter(Boolean).some((keyword) => haystack.includes(keyword));
}

function toNumber(value: string): number {
  const parsed = Number(value.replace(",", "."));
  return Number.isFinite(parsed) ? parsed : 0;
}

function positiveInteger(value: number | undefined, fallback: number): number {
  return Number.isFinite(value) && Number(value) > 0 ? Math.max(1, Math.round(Number(value))) : fallback;
}

function nonNegativeInteger(value: number | undefined, fallback: number): number {
  return Number.isFinite(value) && Number(value) >= 0 ? Math.max(0, Math.round(Number(value))) : fallback;
}

function stripEmptySpecs(specs: Array<{ label: string; value: string }>): Array<{ label: string; value: string }> {
  return specs.filter((spec) => spec.value.trim() !== "");
}

function uniqueSorted(values: string[]): string[] {
  return Array.from(new Set(values)).sort((a, b) => a.localeCompare(b, "tr"));
}

function auditId(prefix: string, now: string, count: number): string {
  return `${prefix}-${slugify(now)}-${count}`;
}

function stripUndefined<T extends Record<string, unknown>>(value: T): Partial<T> {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined)) as Partial<T>;
}
