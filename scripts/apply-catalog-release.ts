import { cp, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  createEmptyCatalogStore,
  mergeImportedProducts,
  publishProducts,
  type CatalogStore,
  type ImportedSupplierProduct
} from "@entas/catalog";

const args = new Map(process.argv.slice(2).map((argument) => {
  const [key, ...value] = argument.replace(/^--/, "").split("=");
  return [key, value.join("=") || "true"];
}));
const releaseDir = path.resolve(requiredOption("release"));
const catalogStorePath = path.resolve(requiredOption("catalog-store"));
const uploadsDir = path.resolve(requiredOption("uploads"));
const actor = args.get("actor")?.trim() || "catalog-release";

async function main(): Promise<void> {
  const products = JSON.parse(await readFile(path.join(releaseDir, "products.json"), "utf8")) as ImportedSupplierProduct[];
  if (!products.length) throw new Error("Sürüm paketinde ürün yok.");
  const releaseKeys = new Set(products.map(importKey));
  if (releaseKeys.size !== products.length) throw new Error("Sürüm paketinde tekrarlanan ürün anahtarı var.");

  await mkdir(path.dirname(catalogStorePath), { recursive: true });
  await mkdir(uploadsDir, { recursive: true });
  await cp(path.join(releaseDir, "uploads"), uploadsDir, { recursive: true, force: true });

  const now = new Date().toISOString();
  const store = await loadCatalogStore(catalogStorePath, now);
  const merged = mergeImportedProducts(store, products, now);
  const ids = merged.products.filter((product) => releaseKeys.has(`${product.sourceKey}\u0000${product.externalId}`)).map((product) => product.id);
  if (ids.length !== products.length) throw new Error(`Birleştirme sonrası ${products.length} yerine ${ids.length} ürün bulundu.`);
  const published = publishProducts(merged, ids, actor, now).store;
  const activeCount = published.products.filter((product) => ids.includes(product.id) && product.status === "ACTIVE" && product.isVisible).length;
  if (activeCount !== products.length) throw new Error(`Yayın sonrası yalnız ${activeCount}/${products.length} ürün aktif.`);

  const temporaryPath = `${catalogStorePath}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(published, null, 2)}\n`);
  await rename(temporaryPath, catalogStorePath);
  console.log(JSON.stringify({ release: path.basename(releaseDir), imported: products.length, active: activeCount }, null, 2));
}

async function loadCatalogStore(filePath: string, now: string): Promise<CatalogStore> {
  try {
    return JSON.parse(await readFile(filePath, "utf8")) as CatalogStore;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return createEmptyCatalogStore(now);
    throw error;
  }
}

function importKey(product: ImportedSupplierProduct): string {
  return `${product.sourceKey}\u0000${product.externalId}`;
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
