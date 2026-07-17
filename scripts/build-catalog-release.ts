import { copyFile, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import type { CatalogProductRecord, CatalogStore, ImportedSupplierProduct } from "@entas/catalog";

const args = new Map(process.argv.slice(2).map((argument) => {
  const [key, ...value] = argument.replace(/^--/, "").split("=");
  return [key, value.join("=") || "true"];
}));
const rootDir = path.resolve(import.meta.dirname, "..");
const releaseDir = path.resolve(requiredOption("release"));
const catalogStorePath = path.resolve(args.get("catalog-store") || path.join(rootDir, "data/catalog-store.json"));
const sourceKeys = (args.get("sources") || "").split(",").map((value) => value.trim()).filter(Boolean);
const shouldWrite = args.get("write") === "true";

async function main(): Promise<void> {
  if (!sourceKeys.length) throw new Error("--sources=source-a,source-b zorunludur.");
  const store = JSON.parse(await readFile(catalogStorePath, "utf8")) as CatalogStore;
  const selected = store.products.filter((product) => sourceKeys.includes(product.sourceKey));
  const selectedKeys = new Set(selected.map(recordKey));
  if (selected.length !== selectedKeys.size) throw new Error("Sürüm paketinde tekrarlanan kaynak/externalId anahtarı var.");
  const sourceCounts = Object.fromEntries(sourceKeys.map((sourceKey) => [sourceKey, selected.filter((product) => product.sourceKey === sourceKey).length]));
  if (Object.values(sourceCounts).some((count) => count === 0)) throw new Error(`Ürünsüz kaynak var: ${JSON.stringify(sourceCounts)}`);
  const inactive = selected.filter((product) => product.status !== "ACTIVE" || !product.isVisible);
  if (inactive.length) throw new Error(`${inactive.length} ürün yayında değil; sürüm paketi yalnız aktif ürünlerden oluşturulur.`);

  const products = selected.map(toImportedProduct);
  const imageUrls = [...new Set(products.map((product) => product.imageUrl).filter((value): value is string => Boolean(value?.startsWith("/uploads/"))))];
  const report = { releaseDir, products: products.length, sourceCounts, images: imageUrls.length };
  if (!shouldWrite) {
    console.log(JSON.stringify({ mode: "dry-run", ...report }, null, 2));
    return;
  }

  await rm(releaseDir, { recursive: true, force: true });
  await mkdir(path.join(releaseDir, "uploads"), { recursive: true });
  for (const imageUrl of imageUrls) {
    const relativePath = imageUrl.slice("/uploads/".length).split("?", 1)[0]!;
    const sourcePath = path.join(rootDir, "apps/web/public/uploads", relativePath);
    const destinationPath = path.join(releaseDir, "uploads", relativePath);
    await mkdir(path.dirname(destinationPath), { recursive: true });
    await copyFile(sourcePath, destinationPath);
  }
  await writeFile(path.join(releaseDir, "products.json"), `${JSON.stringify(products, null, 2)}\n`);
  await writeFile(path.join(releaseDir, "manifest.json"), `${JSON.stringify({
    version: path.basename(releaseDir),
    createdAt: new Date().toISOString(),
    sourceCounts,
    productCount: products.length,
    imageCount: imageUrls.length
  }, null, 2)}\n`);
  console.log(JSON.stringify({ mode: "write", ...report }, null, 2));
}

function toImportedProduct(product: CatalogProductRecord): ImportedSupplierProduct {
  return stripUndefined({
    sourceKey: product.sourceKey,
    sourceName: product.sourceName,
    externalId: product.externalId,
    sku: product.sku,
    barcode: product.barcode,
    manufacturerCode: product.manufacturerCode,
    productName: product.name,
    brandName: product.brand,
    categoryPath: product.categoryPath,
    categoryName: product.category,
    unitType: product.unitType,
    taxRate: product.taxRate,
    currency: product.currency,
    listPrice: product.listPrice,
    stockQuantity: product.stockQuantity,
    stockStatus: product.stockStatus,
    stockQuantityKnown: product.stockQuantityKnown,
    description: product.description,
    technicalSpecs: product.technicalSpecs,
    minOrder: product.minOrder,
    packageQuantity: product.packageQuantity,
    cartonQuantity: product.cartonQuantity,
    palletQuantity: product.palletQuantity,
    warrantyMonths: product.warrantyMonths,
    imageUrl: product.imageUrl,
    sourceUrl: product.sourceUrl,
    priceVisibleToPublic: false
  }) as ImportedSupplierProduct;
}

function recordKey(product: CatalogProductRecord): string {
  return `${product.sourceKey}\u0000${product.externalId}`;
}

function stripUndefined<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined)) as T;
}

function requiredOption(name: string): string {
  const value = args.get(name)?.trim();
  if (!value) throw new Error(`--${name}=... zorunludur.`);
  return value;
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
