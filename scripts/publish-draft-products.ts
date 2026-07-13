import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { publishProducts, type CatalogStore } from "@entas/catalog";

const rootDir = path.resolve(import.meta.dirname, "..");
const storePath = path.join(rootDir, "data", "catalog-store.json");
const auditPath = path.join(rootDir, "data", "audit-log.json");
const actor = process.env.PUBLISH_ACTOR || "admin@entasburada.com";

async function main(): Promise<void> {
  const store = JSON.parse(await readFile(storePath, "utf8")) as CatalogStore;
  const draftIds = store.products
    .filter((product) => product.status !== "ACTIVE" || !product.isVisible)
    .map((product) => product.id);

  if (draftIds.length === 0) {
    console.log("Yayınlanacak taslak ürün yok.");
    return;
  }

  const { store: nextStore, auditLogs } = publishProducts(store, draftIds, actor);
  await writeFile(storePath, JSON.stringify(nextStore, null, 2), "utf8");

  if (auditLogs.length > 0) {
    const existing = JSON.parse(await readFile(auditPath, "utf8").catch(() => "[]")) as unknown[];
    await writeFile(auditPath, JSON.stringify([...auditLogs, ...existing], null, 2), "utf8");
  }

  console.log(`${draftIds.length} taslak ürün yayına alındı (ACTIVE + görünür).`);
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
