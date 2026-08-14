import { createHash } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import type { ImportedSupplierProduct } from "@entas/catalog";
import { parseProductXmlBufferPreview } from "@entas/import-engine";

const rootDir = process.cwd();
const releaseVersion = "2026-08-14-euromix-xml-eksi22-v2";
const releaseDir = path.join(rootDir, "deploy", "catalog-releases", releaseVersion);
const xmlPath = process.env.EUROMIX_XML_PATH || path.join(rootDir, "data", "import-sources", "EuromixStoklar.xml");
const supplierProductsPath = path.join(rootDir, "data", "import-results", "supplier-products.json");
const xmlUrl = "https://bayi.euro-mix.com.tr/C79BE2D9-04CE-4B5B-A51C-7E8F78E25FE3/EuromixStoklar.xml";
const shouldWrite = process.argv.includes("--write");

async function main(): Promise<void> {
  const [xmlBuffer, supplierProducts] = await Promise.all([
    readFile(xmlPath),
    readJson<ImportedSupplierProduct[]>(supplierProductsPath)
  ]);
  const parsed = await parseProductXmlBufferPreview(xmlBuffer, { previewLimit: Number.MAX_SAFE_INTEGER });
  if (parsed.issues.length) throw new Error(`Euromix XML içinde ${parsed.issues.length} geçersiz satır var.`);

  const euromixProducts = supplierProducts.filter((product) => product.sourceKey === "euromix-stock");
  const xmlByExternalId = new Map(parsed.acceptedRows.map((row) => [row.externalId, row]));
  if (parsed.acceptedRows.length !== euromixProducts.length) {
    throw new Error(`XML ${parsed.acceptedRows.length}, normalize ürün listesi ${euromixProducts.length} kayıt içeriyor.`);
  }

  const releaseProducts = euromixProducts.map((product) => {
    const xml = xmlByExternalId.get(product.externalId);
    if (!xml) throw new Error(`XML'de ürün bulunamadı: ${product.externalId}`);
    if (xml.currency && xml.currency !== product.currency) {
      throw new Error(`${product.sku}: XML para birimi ${xml.currency}, ürün para birimi ${product.currency}.`);
    }
    return {
      ...product,
      sourceName: "EuroMix Güncel Stok XML - Liste Eksi %22",
      listPrice: normalizeMoney(xml.listPrice || "0")
    } satisfies ImportedSupplierProduct;
  });

  const positiveProducts = releaseProducts.filter((product) => Number(product.listPrice) > 0);
  const manifest = {
    version: releaseVersion,
    createdAt: new Date().toISOString(),
    xmlUrl,
    xmlSha256: createHash("sha256").update(xmlBuffer).digest("hex"),
    xmlRecordCount: parsed.totalRows,
    acceptedRecordCount: parsed.acceptedRows.length,
    productCount: releaseProducts.length,
    positivePriceCount: positiveProducts.length,
    zeroPriceCount: releaseProducts.length - positiveProducts.length,
    currencyCounts: countBy(releaseProducts, (product) => product.currency),
    pricingPolicy: "Katalog listPrice alanı güncel Euromix XML Fiyat değerine sıfırlandı. Bayi satış fiyatı ticari politika katmanında XML liste × 0,78 olarak hesaplanır; ilave kâr veya indirim zinciri uygulanmaz.",
    statusPolicy: "Fiyatlar hazırlandı; önceki kullanıcı talebi uyarınca Euromix ürünleri PASSIVE kalır.",
    samples: positiveProducts.slice(0, 12).map((product) => ({
      sku: product.sku,
      currency: product.currency,
      xmlListPrice: product.listPrice,
      dealerPriceAt22Discount: money(Number(product.listPrice) * 0.78)
    })),
    mode: shouldWrite ? "write" : "dry-run"
  };

  if (!shouldWrite) {
    console.log(JSON.stringify(manifest, null, 2));
    return;
  }

  await rm(releaseDir, { recursive: true, force: true });
  await mkdir(path.join(releaseDir, "uploads"), { recursive: true });
  await Promise.all([
    writeFile(path.join(releaseDir, "products.json"), `${JSON.stringify(releaseProducts, null, 2)}\n`),
    writeFile(path.join(releaseDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`),
    writeFile(path.join(releaseDir, "uploads", ".gitkeep"), "")
  ]);
  console.log(JSON.stringify(manifest, null, 2));
}

async function readJson<T>(filePath: string): Promise<T> {
  return JSON.parse(await readFile(filePath, "utf8")) as T;
}

function normalizeMoney(value: string): string {
  const parsed = Number(value.replace(",", "."));
  if (!Number.isFinite(parsed) || parsed < 0) throw new Error(`Geçersiz XML fiyatı: ${value}`);
  return parsed.toFixed(4);
}

function money(value: number): string {
  return (Math.round((value + Number.EPSILON) * 100) / 100).toFixed(2);
}

function countBy<T>(items: T[], key: (item: T) => string): Record<string, number> {
  return items.reduce<Record<string, number>>((result, item) => {
    const value = key(item);
    result[value] = (result[value] || 0) + 1;
    return result;
  }, {});
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
