import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { CatalogStore, ImportedSupplierProduct } from "@entas/catalog";

const rootDir = process.cwd();
const releaseVersion = "2026-08-10-euromix-price-reset-v1";
const releaseDir = path.join(rootDir, "deploy", "catalog-releases", releaseVersion);
const catalogStorePath = path.join(rootDir, "data", "catalog-store.json");
const supplierProductsPath = path.join(rootDir, "data", "import-results", "supplier-products.json");

async function main(): Promise<void> {
  const [catalogStore, supplierProducts] = await Promise.all([
    readJson<CatalogStore>(catalogStorePath),
    readJson<ImportedSupplierProduct[]>(supplierProductsPath)
  ]);

  const supplierByKey = new Map(
    supplierProducts
      .filter((product) => product.brandName.trim().toLocaleUpperCase("tr-TR") === "EUROMIX")
      .map((product) => [importKey(product.sourceKey, product.externalId), product] as const)
  );

  const changes = catalogStore.products
    .filter((product) => product.brand.trim().toLocaleUpperCase("tr-TR") === "EUROMIX" && product.status === "ACTIVE")
    .flatMap((product) => {
      const supplier = supplierByKey.get(importKey(product.sourceKey, product.externalId));
      if (!supplier) return [];
      if (product.currency !== supplier.currency) {
        throw new Error(`${product.sku}: katalog para birimi ${product.currency}, tedarikçi para birimi ${supplier.currency}.`);
      }

      const currentPrice = Number(product.listPrice);
      const sourcePrice = Number(supplier.listPrice);
      if (!Number.isFinite(currentPrice) || !Number.isFinite(sourcePrice)) {
        throw new Error(`${product.sku}: geçersiz fiyat.`);
      }
      if (Math.abs(currentPrice - sourcePrice) <= 0.005) return [];

      return [{
        product: supplier,
        change: {
          sku: product.sku,
          name: product.name,
          currency: product.currency,
          previousCatalogPrice: money(currentPrice),
          restoredSupplierListPrice: money(sourcePrice),
          previousMultiplier: roundRatio(currentPrice / sourcePrice),
          customerPriceAt32_60Profit: money(sourcePrice * 1.326)
        }
      }];
    });

  if (changes.length !== 17) {
    throw new Error(`Beklenen 17 eski kârlı Euromix kaydı yerine ${changes.length} fiyat farkı bulundu.`);
  }

  const releaseProducts = changes.map(({ product }) => product);
  const manifest = {
    version: releaseVersion,
    createdAt: new Date().toISOString(),
    sourceCounts: { "euromix-stock": releaseProducts.length },
    productCount: releaseProducts.length,
    imageCount: 0,
    resetPolicy: "Euromix katalog fiyatı tedarikçi ham liste fiyatına sıfırlandı; müşteri fiyatında merkezi %32,60 kâr uygulanır.",
    changes: changes.map(({ change }) => change)
  };

  await mkdir(path.join(releaseDir, "uploads"), { recursive: true });
  await Promise.all([
    writeFile(path.join(releaseDir, "products.json"), `${JSON.stringify(releaseProducts, null, 2)}\n`),
    writeFile(path.join(releaseDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`),
    writeFile(path.join(releaseDir, "uploads", ".gitkeep"), "")
  ]);

  console.log(JSON.stringify({ release: releaseVersion, products: releaseProducts.length, changes: manifest.changes }, null, 2));
}

async function readJson<T>(filePath: string): Promise<T> {
  return JSON.parse(await readFile(filePath, "utf8")) as T;
}

function importKey(sourceKey: string, externalId: string): string {
  return `${sourceKey}\u0000${externalId}`;
}

function money(value: number): string {
  return (Math.round((value + Number.EPSILON) * 100) / 100).toFixed(2);
}

function roundRatio(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
