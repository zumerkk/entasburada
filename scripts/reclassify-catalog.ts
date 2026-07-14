import { readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  CATALOG_CLASSIFICATION_VERSION,
  classifyCatalogProduct,
  isCatalogIndexRecord,
  summarizeCatalogProducts,
  type CatalogProductRecord,
  type CatalogStore
} from "@entas/catalog";

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});

async function main(): Promise<void> {
  const shouldWrite = process.argv.includes("--write");
  const rootDir = process.cwd();
  const storePath = path.join(rootDir, "data", "catalog-store.json");
  const store = JSON.parse(await readFile(storePath, "utf8")) as CatalogStore;

  let changed = 0;
  let hiddenCatalogIndexes = 0;
  const groups = new Map<string, number>();
  const methods = new Map<string, number>();
  const reviewExamples: Array<{ sku: string; name: string; sourceCategory: string; assigned: string }> = [];

  const products = store.products.map((product) => {
    const { catalogClassification: _existingClassification, ...unclassifiedProduct } = product;
    const classification = classifyCatalogProduct(unclassifiedProduct);
    const catalogIndex = isCatalogIndexRecord(product);
    if (catalogIndex) {
      hiddenCatalogIndexes += 1;
    } else {
      groups.set(classification.groupLabel, (groups.get(classification.groupLabel) ?? 0) + 1);
    }
    methods.set(classification.method, (methods.get(classification.method) ?? 0) + 1);

    if (classification.method === "fallback" && reviewExamples.length < 25) {
      reviewExamples.push({
        sku: product.sku,
        name: product.name,
        sourceCategory: product.category,
        assigned: classification.categoryLabel
      });
    }

    if (
      JSON.stringify(product.catalogClassification) !== JSON.stringify(classification) ||
      (catalogIndex && (product.status !== "PASSIVE" || product.isVisible))
    ) {
      changed += 1;
    }

    return {
      ...product,
      ...(catalogIndex ? { status: "PASSIVE" as const, isVisible: false } : {}),
      catalogClassification: classification
    } satisfies CatalogProductRecord;
  });

  const report = {
    version: CATALOG_CLASSIFICATION_VERSION,
    mode: shouldWrite ? "write" : "dry-run",
    products: products.length,
    visibleProducts: products.length - hiddenCatalogIndexes,
    hiddenCatalogIndexes,
    changed,
    groups: Object.fromEntries([...groups.entries()].sort((a, b) => b[1] - a[1])),
    methods: Object.fromEntries([...methods.entries()].sort((a, b) => b[1] - a[1])),
    reviewExamples
  };

  if (products.length !== store.products.length) {
    throw new Error("Sınıflandırma sırasında ürün sayısı değişti; katalog yazılmadı.");
  }

  if (shouldWrite && changed > 0) {
    const nextStore: CatalogStore = {
      ...store,
      updatedAt: new Date().toISOString(),
      products,
      importSummary: summarizeCatalogProducts(products)
    };
    const temporaryPath = `${storePath}.tmp-${process.pid}`;
    await writeFile(temporaryPath, `${JSON.stringify(nextStore, null, 2)}\n`, "utf8");
    await rename(temporaryPath, storePath);
  }

  console.log(JSON.stringify(report, null, 2));
}
