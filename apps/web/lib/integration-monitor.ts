import "server-only";
import { existsSync, statSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { ImportedSupplierProduct } from "@entas/catalog";
import { getCatalogOverview } from "./catalog-repository";

export interface IntegrationSourceHealth {
  key: string;
  name: string;
  path: string;
  url?: string;
  status: "ok" | "warning" | "error";
  statusLabel: string;
  totalRows: number;
  acceptedRows: number;
  issueCount: number;
  activeProducts: number;
  zeroPriceProducts: number;
  outOfStockProducts: number;
  pendingNewProducts: number;
  pendingPriceChanges: number;
  pendingStockChanges: number;
  fileUpdatedAt?: string;
}

export interface IntegrationHealth {
  generatedAt: string;
  totalProducts: number;
  activeProducts: number;
  zeroPriceRows: number;
  duplicateSkuCount: number;
  duplicateBarcodeCount: number;
  inStock: number;
  lowStock: number;
  outOfStock: number;
  pendingNewProducts: number;
  pendingPriceChanges: number;
  pendingStockChanges: number;
  sources: IntegrationSourceHealth[];
}

const rootDir = findWorkspaceRoot(process.cwd());
const importProductsPath = path.join(rootDir, "data", "import-results", "supplier-products.json");

export async function getIntegrationHealth(): Promise<IntegrationHealth> {
  const { store, importReport } = await getCatalogOverview();
  const importedProducts = await readJson<ImportedSupplierProduct[]>(importProductsPath, []);
  const existingByKey = new Map(store.products.map((product) => [`${product.sourceKey}:${product.externalId}`, product]));
  const reportSources = importReport?.sources ?? [];
  const totals = importReport?.totals;
  const allChangeMetrics = changeMetrics(importedProducts, existingByKey);

  return {
    generatedAt: importReport?.generatedAt ?? store.updatedAt,
    totalProducts: totals?.products ?? store.importSummary.importedRows,
    activeProducts: store.importSummary.active,
    zeroPriceRows: totals?.zeroPriceRows ?? store.importSummary.zeroPrice,
    duplicateSkuCount: totals?.duplicateSkuCount ?? 0,
    duplicateBarcodeCount: totals?.duplicateBarcodeCount ?? 0,
    inStock: totals?.inStock ?? store.importSummary.inStock,
    lowStock: totals?.lowStock ?? store.importSummary.lowStock,
    outOfStock: totals?.outOfStock ?? store.importSummary.outOfStock,
    pendingNewProducts: allChangeMetrics.pendingNewProducts,
    pendingPriceChanges: allChangeMetrics.pendingPriceChanges,
    pendingStockChanges: allChangeMetrics.pendingStockChanges,
    sources: reportSources.map((source) => {
      const products = store.products.filter((product) => product.sourceKey === source.key);
      const importedSourceProducts = importedProducts.filter((product) => product.sourceKey === source.key);
      const sourceChangeMetrics = changeMetrics(importedSourceProducts, existingByKey);
      const filePath = path.resolve(rootDir, source.path);
      const fileUpdatedAt = existsSync(filePath) ? statSync(filePath).mtime.toISOString() : undefined;
      const status = source.issueCount > 0 ? "error" : source.acceptedRows === 0 ? "warning" : "ok";

      return {
        key: source.key,
        name: source.name,
        path: source.path,
        ...(source.url ? { url: source.url } : {}),
        status,
        statusLabel: status === "ok" ? "Saglikli" : status === "warning" ? "Kontrol" : "Hata var",
        totalRows: source.totalRows,
        acceptedRows: source.acceptedRows,
        issueCount: source.issueCount,
        activeProducts: products.filter((product) => product.status === "ACTIVE" && product.isVisible).length,
        zeroPriceProducts: products.filter((product) => Number(product.listPrice) === 0).length,
        outOfStockProducts: products.filter((product) => product.stockStatus === "out_of_stock").length,
        pendingNewProducts: sourceChangeMetrics.pendingNewProducts,
        pendingPriceChanges: sourceChangeMetrics.pendingPriceChanges,
        pendingStockChanges: sourceChangeMetrics.pendingStockChanges,
        ...(fileUpdatedAt ? { fileUpdatedAt } : {})
      };
    })
  };
}

function changeMetrics(importedProducts: ImportedSupplierProduct[], existingByKey: Map<string, { listPrice: string; stockQuantity: number }>) {
  let pendingNewProducts = 0;
  let pendingPriceChanges = 0;
  let pendingStockChanges = 0;

  for (const product of importedProducts) {
    const existing = existingByKey.get(`${product.sourceKey}:${product.externalId}`);
    if (!existing) {
      pendingNewProducts += 1;
      continue;
    }

    if (Number(existing.listPrice) !== Number(product.listPrice)) {
      pendingPriceChanges += 1;
    }

    if (Number(existing.stockQuantity) !== Number(product.stockQuantity)) {
      pendingStockChanges += 1;
    }
  }

  return { pendingNewProducts, pendingPriceChanges, pendingStockChanges };
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

function findWorkspaceRoot(startDir: string): string {
  let current = startDir;

  while (current !== path.dirname(current)) {
    if (
      existsSync(path.join(current, "pnpm-workspace.yaml")) ||
      existsSync(path.join(current, "data", "catalog-store.json")) ||
      existsSync(path.join(current, "data", "import-results", "supplier-products.json"))
    ) {
      return current;
    }

    current = path.dirname(current);
  }

  return startDir;
}
