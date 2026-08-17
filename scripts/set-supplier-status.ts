/**
 * Bir tedarikçinin/markanın tüm ürünlerini toplu ACTIVE/PASSIVE yapar.
 *
 * Anlaşması biten tedarikçiyi silmek yerine pasife almak için kullanılır:
 * ürün kaydı, SKU'lar, geçmiş teklif/sipariş referansları ve fiyatlar durur;
 * yalnız vitrinden kalkar. Anlaşma yenilenirse --status=ACTIVE ile geri alınır.
 *
 * Ornek:
 *   node --import tsx scripts/set-supplier-status.ts --source=catalog-pdfler-sgs-fiyat-listesi-ocak-2026 --status=PASSIVE
 *   node --import tsx scripts/set-supplier-status.ts --source=... --status=PASSIVE --write
 *
 * Canlida (Render kabugu) kalici disk yolunu vermek gerekir:
 *   --catalog-store=/var/data/data/catalog-store.json --audit-log=/var/data/data/audit-log.json
 *
 * Deploy migration dosyasi ile:
 *   node --import tsx scripts/set-supplier-status.ts --migration=deploy/supplier-status-releases/ornek.json --write
 */
import { copyFile, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { setProductsStatus, type AuditLogEntry, type CatalogStore, type ProductStatus } from "@entas/catalog";

const args = new Map(process.argv.slice(2).map((argument) => {
  const [key, ...value] = argument.replace(/^--/, "").split("=");
  return [key, value.join("=") || "true"];
}));
const rootDir = path.resolve(import.meta.dirname, "..");
const catalogStorePath = path.resolve(args.get("catalog-store") || path.join(rootDir, "data/catalog-store.json"));
const auditLogPath = path.resolve(args.get("audit-log") || path.join(rootDir, "data/audit-log.json"));
const shouldWrite = args.get("write") === "true";

async function main(): Promise<void> {
  const migration = await readMigration(args.get("migration"));
  const sourceKey = args.get("source")?.trim() || migration.source || "";
  const brand = args.get("brand")?.trim() || migration.brand || "";
  const status = toStatus(args.get("status")?.trim() || migration.status || "");
  const actor = args.get("actor")?.trim() || migration.actor || "admin@entasburada.com";
  const externalIds = migration.externalIds?.length ? new Set(migration.externalIds) : undefined;
  if (!sourceKey && !brand) throw new Error("--source=... veya --brand=... zorunludur.");

  const store = JSON.parse(await readFile(catalogStorePath, "utf8")) as CatalogStore;
  const targets = store.products.filter((product) =>
    (sourceKey ? product.sourceKey === sourceKey : true) &&
    (brand ? brandMatches(product.brand, brand) : true) &&
    (externalIds ? externalIds.has(product.externalId) : true)
  );
  if (!targets.length) throw new Error(`Eşleşen ürün yok: source=${sourceKey || "-"} brand=${brand || "-"}`);
  if (migration.expectedMatched !== undefined && targets.length !== migration.expectedMatched) {
    throw new Error(`Migration ${migration.expectedMatched} ürün bekliyordu, ${targets.length} ürün eşleşti.`);
  }

  const alreadyInTarget = targets.filter((product) => product.status === status && product.isVisible === (status === "ACTIVE"));
  const report = {
    catalogStore: catalogStorePath,
    source: sourceKey || "-",
    brand: brand || "-",
    externalIdFilterCount: externalIds?.size ?? 0,
    status,
    matched: targets.length,
    willChange: targets.length - alreadyInTarget.length,
    alreadyInTarget: alreadyInTarget.length,
    brands: countBy(targets, (product) => product.brand),
    sources: countBy(targets, (product) => product.sourceKey)
  };

  if (!shouldWrite) {
    console.log(JSON.stringify({ mode: "dry-run", ...report }, null, 2));
    return;
  }

  const result = setProductsStatus(store, targets.map((product) => product.id), status, actor);
  const backupPath = `${catalogStorePath.replace(/\.json$/, "")}.backup-${status.toLowerCase()}-${stamp()}.json`;
  await copyFile(catalogStorePath, backupPath);
  await writeAtomic(catalogStorePath, `${JSON.stringify(result.store, null, 2)}\n`);
  await appendAuditLogs(result.auditLogs);

  console.log(JSON.stringify({ mode: "write", ...report, changed: result.changed, backup: backupPath }, null, 2));
}

async function readMigration(value: string | undefined): Promise<{
  source?: string;
  brand?: string;
  status?: string;
  actor?: string;
  externalIds?: string[];
  expectedMatched?: number;
}> {
  if (!value) return {};
  const migrationPath = path.resolve(value);
  const parsed = JSON.parse(await readFile(migrationPath, "utf8")) as Record<string, unknown>;
  return {
    source: typeof parsed.source === "string" ? parsed.source.trim() : undefined,
    brand: typeof parsed.brand === "string" ? parsed.brand.trim() : undefined,
    status: typeof parsed.status === "string" ? parsed.status.trim() : undefined,
    actor: typeof parsed.actor === "string" ? parsed.actor.trim() : undefined,
    externalIds: Array.isArray(parsed.externalIds)
      ? parsed.externalIds.filter((value): value is string => typeof value === "string" && value.trim() !== "").map((value) => value.trim())
      : undefined,
    expectedMatched: typeof parsed.expectedMatched === "number" && Number.isInteger(parsed.expectedMatched) && parsed.expectedMatched >= 0
      ? parsed.expectedMatched
      : undefined
  };
}

/** commercial-policy.ts ile ayni kural: "SGS" hem SGS'i hem "SGS PLUS"i kapsar, "SGSX"i kapsamaz. */
function brandMatches(productBrand: string, wanted: string): boolean {
  const normalized = productBrand.trim().toLocaleUpperCase("tr-TR");
  const target = wanted.trim().toLocaleUpperCase("tr-TR");
  return normalized === target || normalized.startsWith(`${target} `);
}

async function appendAuditLogs(logs: AuditLogEntry[]): Promise<void> {
  if (!logs.length) return;
  const existing = await readFile(auditLogPath, "utf8").then((raw) => JSON.parse(raw) as AuditLogEntry[]).catch(() => []);
  await writeAtomic(auditLogPath, `${JSON.stringify([...logs, ...existing].slice(0, 1000), null, 2)}\n`);
}

async function writeAtomic(filePath: string, contents: string): Promise<void> {
  const temporaryPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(temporaryPath, contents);
  await rename(temporaryPath, filePath);
}

function countBy<T>(items: T[], key: (item: T) => string): Record<string, number> {
  return items.reduce<Record<string, number>>((accumulator, item) => {
    const value = key(item);
    accumulator[value] = (accumulator[value] || 0) + 1;
    return accumulator;
  }, {});
}

function toStatus(value: string): ProductStatus {
  if (value === "ACTIVE" || value === "PASSIVE" || value === "DRAFT") return value;
  throw new Error("--status=PASSIVE | ACTIVE | DRAFT olmalidir.");
}

function stamp(): string {
  return new Date().toISOString().replace(/[-:]/g, "").replace(/\..+$/, "");
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
