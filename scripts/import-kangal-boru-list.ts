import { randomUUID } from "node:crypto";
import { readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  mergeImportedProducts,
  publishProducts,
  type CatalogStore,
  type ImportedSupplierProduct
} from "@entas/catalog";

interface KangalPipeRow {
  sku: string;
  diameter: string;
  pressure: number;
  series: "Ağır" | "Hafif";
  rollMeters: number;
  price: string;
}

const rows: KangalPipeRow[] = [
  { sku: "2010MK", diameter: "20x10", pressure: 10, series: "Ağır", rollMeters: 100, price: "18.66" },
  { sku: "2510MK", diameter: "25x10", pressure: 10, series: "Ağır", rollMeters: 100, price: "27.00" },
  { sku: "3210MK", diameter: "32x10", pressure: 10, series: "Ağır", rollMeters: 100, price: "41.18" },
  { sku: "4010MK", diameter: "40x10", pressure: 10, series: "Ağır", rollMeters: 100, price: "54.00" },
  { sku: "5010MK", diameter: "50x10", pressure: 10, series: "Ağır", rollMeters: 100, price: "73.35" },
  { sku: "6310MK", diameter: "63x10", pressure: 10, series: "Ağır", rollMeters: 100, price: "109.40" },
  { sku: "7510MK", diameter: "75x10", pressure: 10, series: "Ağır", rollMeters: 50, price: "135.00" },
  { sku: "9010MK", diameter: "90x10", pressure: 10, series: "Ağır", rollMeters: 50, price: "193.00" },
  { sku: "11010MK", diameter: "110x10", pressure: 10, series: "Ağır", rollMeters: 50, price: "282.50" },
  { sku: "206MK", diameter: "20x6", pressure: 6, series: "Hafif", rollMeters: 100, price: "12.08" },
  { sku: "256MK", diameter: "25x6", pressure: 6, series: "Hafif", rollMeters: 100, price: "18.42" },
  { sku: "326MK", diameter: "32x6", pressure: 6, series: "Hafif", rollMeters: 100, price: "26.69" },
  { sku: "406MK", diameter: "40x6", pressure: 6, series: "Hafif", rollMeters: 100, price: "37.50" },
  { sku: "506MK", diameter: "50x6", pressure: 6, series: "Hafif", rollMeters: 100, price: "53.38" },
  { sku: "636MK", diameter: "63x6", pressure: 6, series: "Hafif", rollMeters: 100, price: "83.89" },
  { sku: "756MK", diameter: "75x6", pressure: 6, series: "Hafif", rollMeters: 50, price: "104.23" },
  { sku: "906MK", diameter: "90x6", pressure: 6, series: "Hafif", rollMeters: 50, price: "152.53" }
];

const args = new Map(
  process.argv.slice(2).map((argument) => {
    const [key, ...value] = argument.replace(/^--/, "").split("=");
    return [key, value.join("=") || "true"];
  })
);
const rootDir = path.resolve(import.meta.dirname, "..");
const storePath = path.resolve(args.get("store") || path.join(rootDir, "data/catalog-store.json"));
const writeChanges = args.get("write") === "true";
const publish = args.get("publish") === "true";
const sourceKey = "manual-kangal-boru-2026-07-17";
const imageUrl = "/uploads/manual-imports/kangal-boru/products/mavi-kangal-boru.webp";

async function main(): Promise<void> {
  const store = JSON.parse(await readFile(storePath, "utf8")) as CatalogStore;
  const importedProducts = rows.map(toImportedProduct);
  let nextStore = mergeImportedProducts(store, importedProducts);
  let publishedCount = 0;

  if (publish) {
    const productIds = nextStore.products.filter((product) => product.sourceKey === sourceKey).map((product) => product.id);
    const result = publishProducts(nextStore, productIds, "manual-kangal-boru-import");
    nextStore = result.store;
    publishedCount = productIds.filter((id) => nextStore.products.some((product) => product.id === id && product.status === "ACTIVE" && product.isVisible)).length;
  }

  if (writeChanges) await writeJsonAtomic(storePath, nextStore);
  console.log(JSON.stringify({
    ok: true,
    mode: writeChanges ? "write" : "dry-run",
    sourceKey,
    rows: rows.length,
    uniqueSkus: new Set(rows.map((row) => row.sku)).size,
    productsWithImages: importedProducts.filter((product) => product.imageUrl).length,
    published: publishedCount,
    storeProductsBefore: store.products.length,
    storeProductsAfter: nextStore.products.length
  }, null, 2));
}

function toImportedProduct(row: KangalPipeRow): ImportedSupplierProduct {
  const productName = `Mavi Kangal Boru ${row.diameter} - ${row.pressure} ATÜ ${row.series} Seri`;
  return {
    sourceKey,
    sourceName: "WhatsApp / Kangal Borular 2026-07-17",
    externalId: row.sku,
    sku: row.sku,
    manufacturerCode: row.sku,
    productName,
    brandName: "GENEL",
    categoryPath: ["Sulama & Bahçe", "Sulama Sistemleri", "Kangal Borular"],
    categoryName: "Kangal Borular",
    unitType: "Metre",
    taxRate: "20",
    currency: "TRY",
    listPrice: row.price,
    stockQuantity: 0,
    stockStatus: "out_of_stock",
    stockQuantityKnown: false,
    description: `${productName}. ${row.rollMeters} metrelik kangal. Liste fiyatına KDV dahil değildir.`,
    technicalSpecs: [
      { label: "Çap", value: row.diameter },
      { label: "Basınç", value: `${row.pressure} ATÜ` },
      { label: "Seri", value: `${row.series} Seri` },
      { label: "Kangal Metrajı", value: `${row.rollMeters} metre` }
    ],
    minOrder: 1,
    packageQuantity: row.rollMeters,
    cartonQuantity: 1,
    palletQuantity: 1,
    warrantyMonths: 0,
    imageUrl,
    sourceUrl: "WhatsApp Image 2026-07-17 at 15.14.21.jpeg",
    priceVisibleToPublic: false
  };
}

async function writeJsonAtomic(filePath: string, value: unknown): Promise<void> {
  const temporaryPath = `${filePath}.${process.pid}.${randomUUID()}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`);
  await rename(temporaryPath, filePath);
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
