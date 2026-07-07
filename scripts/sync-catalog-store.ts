import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  createEmptyCatalogStore,
  createImportAudit,
  mergeImportedProducts,
  publishProducts,
  type AuditLogEntry,
  type CatalogStore,
  type ImportedSupplierProduct
} from "@entas/catalog";

const rootDir = process.cwd();
const dataDir = path.join(rootDir, "data");
const importResultPath = path.join(dataDir, "import-results", "supplier-products.json");
const catalogStorePath = path.join(dataDir, "catalog-store.json");
const auditLogPath = path.join(dataDir, "audit-log.json");

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});

async function main(): Promise<void> {
  const publishNew = process.argv.includes("--publish");
  const actor = process.env.ADMIN_EMAIL ?? "admin@entasburada.com";
  const now = new Date().toISOString();

  await mkdir(dataDir, { recursive: true });

  const importedProducts = await readJson<ImportedSupplierProduct[]>(importResultPath, []);
  const existingStore = await readJson<CatalogStore>(catalogStorePath, createEmptyCatalogStore(now));
  const mergedStore = mergeImportedProducts(existingStore, importedProducts, now);
  const syncAudit = createImportAudit(importedProducts.length, actor, now);

  let nextStore = mergedStore;
  const auditLogs: AuditLogEntry[] = [syncAudit];

  if (publishNew) {
    const publishIds = mergedStore.products
      .filter((product) => product.status !== "ACTIVE" || !product.isVisible)
      .map((product) => product.id);
    const publishResult = publishProducts(mergedStore, publishIds, actor, now);
    nextStore = publishResult.store;
    auditLogs.push(...publishResult.auditLogs);
  }

  const existingAudit = await readJson<AuditLogEntry[]>(auditLogPath, []);
  await writeJson(catalogStorePath, nextStore);
  await writeJson(auditLogPath, [...auditLogs, ...existingAudit].slice(0, 1000));

  console.log(
    JSON.stringify(
      {
        syncedProducts: importedProducts.length,
        activeProducts: nextStore.importSummary.active,
        draftProducts: nextStore.importSummary.draft,
        zeroPriceProducts: nextStore.importSummary.zeroPrice,
        publishNew,
        catalogStorePath: path.relative(rootDir, catalogStorePath),
        auditLogPath: path.relative(rootDir, auditLogPath)
      },
      null,
      2
    )
  );
}

async function readJson<T>(filePath: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await readFile(filePath, "utf8")) as T;
  } catch (error) {
    const code = typeof error === "object" && error !== null && "code" in error ? String(error.code) : "";
    if (code === "ENOENT") {
      return fallback;
    }

    throw error;
  }
}

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`);
}
