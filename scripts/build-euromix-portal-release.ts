import { createHash } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  EUROMIX_BUYING_DISCOUNT_RATE,
  EUROMIX_PORTAL_PRICE_MULTIPLIER,
  EUROMIX_PROFIT_RATE,
  EUROMIX_VAT_RATE,
  calculateEuromixPortalSalePrice,
  type ImportedSupplierProduct
} from "@entas/catalog";

interface PortalSnapshotProduct {
  portalProductId: number;
  sku: string;
  name: string;
  imageUrl?: string | null;
  portalNetPrice?: number | null;
  vatIncludedPrice?: number | null;
  priceUpdatedAt?: string | null;
  inStock: boolean;
  topCategory: string;
  topCategoryId: number;
  subCategory?: string;
  subCategoryId?: number;
}

interface PortalSnapshot {
  schemaVersion: number;
  capturedAt: string;
  sourceUrl: string;
  products: PortalSnapshotProduct[];
}

interface ImportReport {
  generatedAt: string;
  sources: Array<Record<string, unknown> & { key: string }>;
  totals: Record<string, number>;
  duplicateSkus: Array<{ value: string; count: number }>;
  duplicateBarcodes: Array<{ value: string; count: number }>;
}

const args = new Map(process.argv.slice(2).map((argument) => {
  const [key, ...value] = argument.replace(/^--/, "").split("=");
  return [key, value.join("=") || "true"];
}));
const rootDir = process.cwd();
const releaseVersion = args.get("version")?.trim() || "2026-08-19-euromix-portal-vat20-profit40-v2";
const releaseDir = path.join(rootDir, "deploy", "catalog-releases", releaseVersion);
const supplierProductsPath = path.join(rootDir, "data", "import-results", "supplier-products.json");
const legacyEuromixProductsPath = path.join(
  rootDir,
  "deploy",
  "catalog-releases",
  "2026-08-14-euromix-xml-eksi22-v2",
  "products.json"
);
const importReportPath = path.join(rootDir, "data", "import-results", "import-report.json");
const supplierCsvPath = path.join(rootDir, "data", "import-results", "supplier-products.csv");
const statusReleaseDir = path.join(rootDir, "deploy", "supplier-status-releases");
const snapshotPath = path.resolve(requiredOption("snapshot"));
const shouldWrite = args.get("write") === "true";

async function main(): Promise<void> {
  const [snapshotRaw, supplierProducts, legacyEuromixProducts, importReport] = await Promise.all([
    readFile(snapshotPath, "utf8"),
    readJson<ImportedSupplierProduct[]>(supplierProductsPath),
    readJson<ImportedSupplierProduct[]>(legacyEuromixProductsPath),
    readJson<ImportReport>(importReportPath)
  ]);
  const snapshot = JSON.parse(snapshotRaw) as PortalSnapshot;
  validateSnapshot(snapshot);

  const currentEuromix = supplierProducts.filter((product) => product.sourceKey === "euromix-stock");
  const legacyBySku = uniqueBy(legacyEuromixProducts, (product) => normalizeSku(product.sku), "eski Euromix SKU");
  const otherProducts = supplierProducts.filter((product) => product.sourceKey !== "euromix-stock");
  const existingBySku = new Map(legacyBySku);
  for (const [sku, product] of uniqueBy(currentEuromix, (row) => normalizeSku(row.sku), "mevcut Euromix SKU")) {
    existingBySku.set(sku, product);
  }
  uniqueBy(snapshot.products, (product) => normalizeSku(product.sku), "portal SKU");

  const pricedPortalProducts = snapshot.products.filter(hasNumericPortalPrice);
  const askPriceProducts = snapshot.products.filter((product) => !hasNumericPortalPrice(product));
  let matchedExistingCount = 0;
  let newProductCount = 0;

  const releaseProducts = pricedPortalProducts.map((portalProduct) => {
    const existing = existingBySku.get(normalizeSku(portalProduct.sku));
    if (legacyBySku.has(normalizeSku(portalProduct.sku))) matchedExistingCount += 1;
    else newProductCount += 1;
    return toReleaseProduct(portalProduct, existing);
  }).sort((left, right) => left.externalId.localeCompare(right.externalId, "tr"));

  const releaseExternalIds = releaseProducts.map((product) => product.externalId);
  const nextSupplierProducts = [...otherProducts, ...releaseProducts];
  const bh012 = releaseProducts.find((product) => normalizeSku(product.sku) === "BH 012");
  if (!bh012 || bh012.listPrice !== "615.82") {
    throw new Error(`BH 012 beklenen 615.82 TL yerine ${bh012?.listPrice ?? "bulunamadi"}.`);
  }

  const manifest = {
    version: releaseVersion,
    createdAt: new Date().toISOString(),
    portalCapturedAt: snapshot.capturedAt,
    portalUrl: snapshot.sourceUrl,
    snapshotSha256: createHash("sha256").update(snapshotRaw).digest("hex"),
    portalProductCount: snapshot.products.length,
    publishedProductCount: releaseProducts.length,
    askPricePassiveCount: askPriceProducts.length,
    matchedExistingCount,
    newProductCount,
    removedOrUnpricedPassiveCount: Math.max(0, legacyEuromixProducts.length + newProductCount - releaseProducts.length),
    currencyCounts: countBy(releaseProducts, (product) => product.currency),
    pricing: {
      portalPriceBasis: "KDV haric Net Fiyat (TRY)",
      buyingDiscountRate: EUROMIX_BUYING_DISCOUNT_RATE,
      vatRate: EUROMIX_VAT_RATE,
      profitRate: EUROMIX_PROFIT_RATE,
      multiplier: EUROMIX_PORTAL_PRICE_MULTIPLIER,
      formula: "portalNet × 1,20 × 1,40",
      rounding: "final amount rounded to 2 decimals"
    },
    statusPolicy: "Portalda sayisal Net Fiyat bulunan urunler ACTIVE; portalda olmayan veya Fiyat Sorunuz yazan urunler PASSIVE.",
    samples: [bh012, ...releaseProducts.filter((product) => product !== bh012).slice(0, 9)].map((product) => {
      const portal = pricedPortalProducts.find((row) => normalizeSku(row.sku) === normalizeSku(product.sku));
      return {
        sku: product.sku,
        portalNetPrice: portal?.portalNetPrice,
        salePrice: product.listPrice
      };
    }),
    mode: shouldWrite ? "write" : "dry-run"
  };

  if (!shouldWrite) {
    console.log(JSON.stringify(manifest, null, 2));
    return;
  }

  const nextImportReport = buildImportReport(importReport, snapshot, nextSupplierProducts, askPriceProducts.length, releaseVersion);
  const allPassiveMigration = {
    source: "euromix-stock",
    status: "PASSIVE",
    actor: "euromix-portal-sync",
    reason: "Portalda olmayan veya sayisal net fiyati bulunmayan eski Euromix kayitlarini vitrinden kaldir."
  };
  const activeMigration = {
    source: "euromix-stock",
    status: "ACTIVE",
    actor: "euromix-portal-sync",
    externalIds: releaseExternalIds,
    expectedMatched: releaseProducts.length,
    catalogRelease: releaseVersion,
    pricingPolicy: "Portal Net Fiyat × 1,20 KDV × 1,40 kar; alis iskontosu yok."
  };

  await rm(releaseDir, { recursive: true, force: true });
  await mkdir(path.join(releaseDir, "uploads"), { recursive: true });
  await mkdir(statusReleaseDir, { recursive: true });
  await Promise.all([
    writeJson(path.join(releaseDir, "products.json"), releaseProducts),
    writeJson(path.join(releaseDir, "manifest.json"), manifest),
    writeFile(path.join(releaseDir, "uploads", ".gitkeep"), ""),
    writeJson(path.join(statusReleaseDir, "2026-08-19-euromix-portal-all-passive-v6.json"), allPassiveMigration),
    writeJson(path.join(statusReleaseDir, "2026-08-19-euromix-portal-current-active-v7.json"), activeMigration),
    writeJson(supplierProductsPath, nextSupplierProducts),
    writeJson(importReportPath, nextImportReport),
    writeFile(supplierCsvPath, toCsv(nextSupplierProducts))
  ]);
  console.log(JSON.stringify(manifest, null, 2));
}

function toReleaseProduct(portal: PortalSnapshotProduct, existing?: ImportedSupplierProduct): ImportedSupplierProduct {
  const salePrice = calculateEuromixPortalSalePrice(portal.portalNetPrice!);
  const imageUrl = usablePortalImage(portal.imageUrl) ?? existing?.imageUrl;
  const categoryPath = existing?.categoryPath?.length
    ? existing.categoryPath
    : [portal.topCategory, portal.subCategory].filter((value): value is string => Boolean(value));
  const knownQuantity = existing?.stockQuantity ?? 0;

  return stripUndefined({
    ...(existing ?? {}),
    sourceKey: "euromix-stock",
    sourceName: "EuroMix Bayi Portalı - Güncel Fiyat V2",
    externalId: normalizeWhitespace(portal.sku),
    sku: normalizeWhitespace(portal.sku),
    productName: normalizeWhitespace(portal.name),
    brandName: "EUROMIX",
    categoryPath,
    categoryName: existing?.categoryName ?? categoryPath.at(-1) ?? portal.topCategory,
    unitType: existing?.unitType || "ADET",
    taxRate: "20.00",
    currency: "TRY",
    listPrice: salePrice.toFixed(2),
    stockQuantity: portal.inStock ? Math.max(1, knownQuantity) : 0,
    stockStatus: portal.inStock ? "in_stock" : "out_of_stock",
    stockQuantityKnown: false,
    imageUrl,
    sourceUrl: `https://bayi.euro-mix.com.tr/Stok/StokDetay/${portal.portalProductId}`,
    priceVisibleToPublic: false as const
  }) as ImportedSupplierProduct;
}

function buildImportReport(
  current: ImportReport,
  snapshot: PortalSnapshot,
  products: ImportedSupplierProduct[],
  askPriceCount: number,
  release: string
): ImportReport & { euromixAskPriceCount: number } {
  const duplicateSkus = duplicateValues(products.map((product) => product.sku).filter(Boolean));
  const duplicateBarcodes = duplicateValues(products.map((product) => product.barcode).filter((value): value is string => Boolean(value)));
  return {
    generatedAt: new Date().toISOString(),
    sources: [
      ...current.sources.filter((source) => source.key !== "euromix-stock"),
      {
        key: "euromix-stock",
        name: "EuroMix Bayi Portalı - Güncel Fiyat V2",
        path: `deploy/catalog-releases/${release}/products.json`,
        url: snapshot.sourceUrl,
        totalRows: snapshot.products.length,
        acceptedRows: snapshot.products.length - askPriceCount,
        issueCount: 0,
        issues: [],
        askPriceRows: askPriceCount,
        capturedAt: snapshot.capturedAt
      }
    ],
    totals: {
      products: products.length,
      inStock: products.filter((product) => product.stockStatus === "in_stock").length,
      lowStock: products.filter((product) => product.stockStatus === "low_stock").length,
      outOfStock: products.filter((product) => product.stockStatus === "out_of_stock").length,
      pricedRows: products.filter((product) => Number(product.listPrice) > 0).length,
      zeroPriceRows: products.filter((product) => Number(product.listPrice) === 0).length,
      duplicateSkuCount: duplicateSkus.length,
      duplicateBarcodeCount: duplicateBarcodes.length
    },
    duplicateSkus: duplicateSkus.slice(0, 100),
    duplicateBarcodes: duplicateBarcodes.slice(0, 100),
    euromixAskPriceCount: askPriceCount
  };
}

function validateSnapshot(snapshot: PortalSnapshot): void {
  if (snapshot.schemaVersion !== 1) throw new Error(`Desteklenmeyen snapshot surumu: ${snapshot.schemaVersion}`);
  if (!Array.isArray(snapshot.products) || snapshot.products.length === 0) throw new Error("Portal snapshot urun icermiyor.");
  if (!snapshot.sourceUrl.startsWith("https://bayi.euro-mix.com.tr/")) throw new Error("Beklenmeyen portal adresi.");
}

function hasNumericPortalPrice(product: PortalSnapshotProduct): product is PortalSnapshotProduct & { portalNetPrice: number } {
  return typeof product.portalNetPrice === "number" && Number.isFinite(product.portalNetPrice) && product.portalNetPrice > 0;
}

function usablePortalImage(value: string | null | undefined): string | undefined {
  if (!value || /\/0\.png(?:$|\?)/.test(value)) return undefined;
  return value.replace("/Midi/", "/Normal/");
}

function normalizeSku(value: string): string {
  return normalizeWhitespace(value).toLocaleUpperCase("tr-TR");
}

function normalizeWhitespace(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function uniqueBy<T>(items: T[], key: (item: T) => string, label: string): Map<string, T> {
  const result = new Map<string, T>();
  for (const item of items) {
    const value = key(item);
    if (result.has(value)) throw new Error(`Tekrarlanan ${label}: ${value}`);
    result.set(value, item);
  }
  return result;
}

function duplicateValues(values: string[]): Array<{ value: string; count: number }> {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts.entries()].filter(([, count]) => count > 1).map(([value, count]) => ({ value, count }));
}

function countBy<T>(items: T[], key: (item: T) => string): Record<string, number> {
  return items.reduce<Record<string, number>>((result, item) => {
    const value = key(item);
    result[value] = (result[value] || 0) + 1;
    return result;
  }, {});
}

function toCsv(rows: ImportedSupplierProduct[]): string {
  const headers: Array<keyof ImportedSupplierProduct> = [
    "sourceKey", "sku", "barcode", "productName", "brandName", "categoryName", "unitType", "taxRate",
    "currency", "listPrice", "stockQuantity", "stockStatus", "imageUrl"
  ];
  const lines = rows.map((row) => headers.map((header) => csvCell(row[header])).join(","));
  return `${headers.join(",")}\n${lines.join("\n")}\n`;
}

function csvCell(value: unknown): string {
  const text = value == null ? "" : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

function stripUndefined<T extends Record<string, unknown>>(value: T): Partial<T> {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined)) as Partial<T>;
}

function requiredOption(name: string): string {
  const value = args.get(name)?.trim();
  if (!value) throw new Error(`--${name}=... zorunludur.`);
  return value;
}

async function readJson<T>(filePath: string): Promise<T> {
  return JSON.parse(await readFile(filePath, "utf8")) as T;
}

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
