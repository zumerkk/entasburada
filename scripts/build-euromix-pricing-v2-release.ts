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

interface ImportReport {
  generatedAt: string;
  sources: Array<Record<string, unknown> & { key: string }>;
  totals: Record<string, number>;
  duplicateSkus: Array<{ value: string; count: number }>;
  duplicateBarcodes: Array<{ value: string; count: number }>;
  euromixAskPriceCount?: number;
}

interface PreviousManifest {
  portalCapturedAt: string;
  portalUrl: string;
  portalProductCount: number;
  askPricePassiveCount: number;
}

const args = new Map(process.argv.slice(2).map((argument) => {
  const [key, ...value] = argument.replace(/^--/, "").split("=");
  return [key, value.join("=") || "true"];
}));
const rootDir = process.cwd();
const sourceReleaseVersion = "2026-08-17-euromix-portal-net-v1";
const releaseVersion = args.get("version")?.trim() || "2026-08-19-euromix-portal-vat20-profit40-v2";
const sourceReleaseDir = path.join(rootDir, "deploy", "catalog-releases", sourceReleaseVersion);
const releaseDir = path.join(rootDir, "deploy", "catalog-releases", releaseVersion);
const supplierProductsPath = path.join(rootDir, "data", "import-results", "supplier-products.json");
const supplierCsvPath = path.join(rootDir, "data", "import-results", "supplier-products.csv");
const importReportPath = path.join(rootDir, "data", "import-results", "import-report.json");
const shouldWrite = args.get("write") === "true";
const legacyMultiplier = 0.85 * 1.2 * 1.3;

async function main(): Promise<void> {
  const [sourceProducts, previousManifest, supplierProducts, importReport] = await Promise.all([
    readJson<ImportedSupplierProduct[]>(path.join(sourceReleaseDir, "products.json")),
    readJson<PreviousManifest>(path.join(sourceReleaseDir, "manifest.json")),
    readJson<ImportedSupplierProduct[]>(supplierProductsPath),
    readJson<ImportReport>(importReportPath)
  ]);

  if (sourceProducts.length !== 1843) {
    throw new Error(`1.843 fiyatli Euromix urunu bekleniyordu, ${sourceProducts.length} bulundu.`);
  }
  if (sourceProducts.some((product) => product.sourceKey !== "euromix-stock" || Number(product.listPrice) <= 0)) {
    throw new Error("Kaynak surum fiyatli Euromix urunleri disinda kayit iceriyor.");
  }

  const recoveredPortalPrices = new Map<string, number>();
  const releaseProducts = sourceProducts.map((product) => {
    const portalNetPrice = recoverPortalNetPrice(product.listPrice, product.sku);
    recoveredPortalPrices.set(product.externalId, portalNetPrice);
    return {
      ...product,
      sourceName: "EuroMix Bayi Portalı - Güncel Fiyat V2",
      listPrice: calculateEuromixPortalSalePrice(portalNetPrice).toFixed(2),
      taxRate: "20.00"
    };
  });

  const releaseByExternalId = uniqueBy(releaseProducts, (product) => product.externalId, "release externalId");
  const currentEuromix = supplierProducts.filter((product) => product.sourceKey === "euromix-stock");
  if (currentEuromix.length !== releaseProducts.length) {
    throw new Error(`Kalici kaynakta ${releaseProducts.length} yerine ${currentEuromix.length} Euromix urunu var.`);
  }
  const nextSupplierProducts = supplierProducts.map((product) => {
    if (product.sourceKey !== "euromix-stock") return product;
    const updated = releaseByExternalId.get(product.externalId);
    if (!updated) throw new Error(`Kalici kaynakta eslesmeyen Euromix urunu: ${product.externalId}`);
    return updated;
  });

  const bh012 = releaseProducts.find((product) => normalizeSku(product.sku) === "BH 012");
  if (!bh012 || recoveredPortalPrices.get(bh012.externalId) !== 366.56 || bh012.listPrice !== "615.82") {
    throw new Error(`BH 012 fiyat kontrolu basarisiz: ${bh012?.listPrice ?? "bulunamadi"}.`);
  }

  const previousTotal = sumMoney(sourceProducts.map((product) => Number(product.listPrice)));
  const nextTotal = sumMoney(releaseProducts.map((product) => Number(product.listPrice)));
  const samples = [bh012, ...releaseProducts.filter((product) => product !== bh012).slice(0, 9)].map((product) => ({
    sku: product.sku,
    portalNetPrice: recoveredPortalPrices.get(product.externalId),
    previousSalePrice: sourceProducts.find((source) => source.externalId === product.externalId)?.listPrice,
    salePrice: product.listPrice
  }));
  const manifest = {
    version: releaseVersion,
    createdAt: new Date().toISOString(),
    sourceRelease: sourceReleaseVersion,
    portalCapturedAt: previousManifest.portalCapturedAt,
    portalUrl: previousManifest.portalUrl,
    portalProductCount: previousManifest.portalProductCount,
    publishedProductCount: releaseProducts.length,
    askPricePassiveCount: previousManifest.askPricePassiveCount,
    recoveredPortalPriceCount: recoveredPortalPrices.size,
    pricing: {
      portalPriceBasis: "KDV haric Net Fiyat (TRY)",
      buyingDiscountRate: EUROMIX_BUYING_DISCOUNT_RATE,
      vatRate: EUROMIX_VAT_RATE,
      profitRate: EUROMIX_PROFIT_RATE,
      multiplier: EUROMIX_PORTAL_PRICE_MULTIPLIER,
      formula: "portalNet × 1,20 × 1,40",
      rounding: "final amount rounded to 2 decimals"
    },
    previousPricing: {
      buyingDiscountRate: 15,
      vatRate: 20,
      profitRate: 30,
      multiplier: legacyMultiplier,
      formula: "portalNet × 0,85 × 1,20 × 1,30"
    },
    recoveryPolicy: (
      "Portal net fiyatlari, onceki surumdeki iki ondalikli satis fiyatini eski 1,326 carpanla " +
      "birebir yeniden uretebilen tek kurus degeri bulunarak geri kazanildi; 1.843/1.843 kayit tekil eslesti."
    ),
    statusPolicy: "1.843 sayisal fiyatli urun ACTIVE; 127 Fiyat Sorunuz kaydi PASSIVE kalir.",
    totals: {
      previousSalePriceSum: previousTotal.toFixed(2),
      salePriceSum: nextTotal.toFixed(2),
      increasePercent: roundMoney((nextTotal / previousTotal - 1) * 100)
    },
    samples,
    mode: shouldWrite ? "write" : "dry-run"
  };

  if (!shouldWrite) {
    console.log(JSON.stringify(manifest, null, 2));
    return;
  }

  const nextImportReport = buildImportReport(importReport, nextSupplierProducts, releaseVersion);
  await rm(releaseDir, { recursive: true, force: true });
  await mkdir(path.join(releaseDir, "uploads"), { recursive: true });
  await Promise.all([
    writeJson(path.join(releaseDir, "products.json"), releaseProducts),
    writeJson(path.join(releaseDir, "manifest.json"), manifest),
    writeFile(path.join(releaseDir, "uploads", ".gitkeep"), ""),
    writeJson(supplierProductsPath, nextSupplierProducts),
    writeJson(importReportPath, nextImportReport),
    writeFile(supplierCsvPath, toCsv(nextSupplierProducts))
  ]);
  console.log(JSON.stringify(manifest, null, 2));
}

function recoverPortalNetPrice(storedSalePrice: string, sku: string): number {
  const salePrice = Number(storedSalePrice);
  if (!Number.isFinite(salePrice) || salePrice <= 0) throw new Error(`Gecersiz eski fiyat: ${sku}`);
  const approximateCents = Math.round(salePrice / legacyMultiplier * 100);
  const candidates: number[] = [];
  for (let cents = Math.max(1, approximateCents - 4); cents <= approximateCents + 4; cents += 1) {
    const portalNetPrice = cents / 100;
    if (roundMoney(portalNetPrice * legacyMultiplier) === salePrice) candidates.push(portalNetPrice);
  }
  if (candidates.length !== 1) {
    throw new Error(`${sku} icin tekil portal net fiyati bulunamadi: ${candidates.join(", ") || "yok"}`);
  }
  return candidates[0]!;
}

function buildImportReport(
  current: ImportReport,
  products: ImportedSupplierProduct[],
  version: string
): ImportReport {
  const duplicateSkus = duplicateValues(products.map((product) => product.sku).filter(Boolean));
  const duplicateBarcodes = duplicateValues(products.map((product) => product.barcode).filter((value): value is string => Boolean(value)));
  return {
    ...current,
    generatedAt: new Date().toISOString(),
    sources: current.sources.map((source) => source.key === "euromix-stock"
      ? {
          ...source,
          name: "EuroMix Bayi Portalı - Güncel Fiyat V2",
          path: `deploy/catalog-releases/${version}/products.json`,
          pricingPolicy: "Portal Net Fiyat × 1,20 KDV × 1,40 kar; alis iskontosu yok."
        }
      : source),
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
    duplicateBarcodes: duplicateBarcodes.slice(0, 100)
  };
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

function normalizeSku(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLocaleUpperCase("tr-TR");
}

function sumMoney(values: number[]): number {
  return roundMoney(values.reduce((total, value) => total + value, 0));
}

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
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
