import "server-only";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { createNotification } from "./notification-repository";

/**
 * "Stok gelince haber ver" abonelikleri. Müşteri, stokta olmayan bir ürüne abone olur;
 * ürün tekrar stoğa girince (catalog sync out→in geçişi) bildirim gönderilir ve
 * abonelik tek-seferlik olarak silinir.
 */

export interface StockSubscription {
  id: string;
  customerId: string;
  email: string;
  sku: string;
  productName: string;
  productSlug: string;
  createdAt: string;
}

function findWorkspaceRoot(startDir: string): string {
  let current = startDir;
  while (current !== path.dirname(current)) {
    if (existsSync(path.join(current, "pnpm-workspace.yaml")) || existsSync(path.join(current, "data", "customer-accounts.json"))) {
      return current;
    }
    current = path.dirname(current);
  }
  return startDir;
}

const rootDir = findWorkspaceRoot(process.cwd());
const dataDir = path.join(rootDir, "data");
const filePath = path.join(dataDir, "stock-subscriptions.json");

function normalizeSku(value: string): string {
  return value.trim().toLocaleLowerCase("tr-TR");
}

export async function listStockSubscriptions(customerId: string): Promise<StockSubscription[]> {
  const all = await readAll();
  return all.filter((entry) => entry.customerId === customerId).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

export async function subscribeToStock(input: {
  customerId: string;
  email: string;
  sku: string;
  productName: string;
  productSlug: string;
}): Promise<void> {
  const sku = input.sku.trim();
  if (!sku) return;
  const all = await readAll();
  const key = normalizeSku(sku);
  const already = all.some((entry) => entry.customerId === input.customerId && normalizeSku(entry.sku) === key);
  if (already) return;

  all.push({
    id: `stocksub-${randomUUID()}`,
    customerId: input.customerId,
    email: input.email,
    sku,
    productName: input.productName.trim() || sku,
    productSlug: input.productSlug.trim(),
    createdAt: new Date().toISOString()
  });
  await saveAll(all);
}

export async function unsubscribeFromStock(customerId: string, sku: string): Promise<void> {
  const all = await readAll();
  const key = normalizeSku(sku);
  const next = all.filter((entry) => !(entry.customerId === customerId && normalizeSku(entry.sku) === key));
  if (next.length !== all.length) await saveAll(next);
}

export async function isSubscribedToStock(customerId: string, sku: string): Promise<boolean> {
  const all = await readAll();
  const key = normalizeSku(sku);
  return all.some((entry) => entry.customerId === customerId && normalizeSku(entry.sku) === key);
}

/**
 * Verilen SKU'lar tekrar stoğa girdiğinde abonelere bildirim gönderir ve
 * bu SKU'lara ait abonelikleri (tek-seferlik) siler. Catalog sync'ten çağrılır.
 */
export async function notifyRestockedSkus(skus: string[]): Promise<number> {
  if (skus.length === 0) return 0;
  const restocked = new Set(skus.map(normalizeSku));
  const all = await readAll();
  const toNotify = all.filter((entry) => restocked.has(normalizeSku(entry.sku)));
  if (toNotify.length === 0) return 0;

  for (const sub of toNotify) {
    await createNotification({
      recipientType: "customer",
      recipientKey: sub.email,
      level: "success",
      title: "Ürün tekrar stokta",
      body: `${sub.productName} yeniden stoğa girdi. Hemen sipariş verebilirsiniz.`,
      href: sub.productSlug ? `/products/${sub.productSlug}` : "/catalog"
    });
  }

  const remaining = all.filter((entry) => !restocked.has(normalizeSku(entry.sku)));
  await saveAll(remaining);
  return toNotify.length;
}

async function readAll(): Promise<StockSubscription[]> {
  try {
    return JSON.parse(await readFile(filePath, "utf8")) as StockSubscription[];
  } catch {
    return [];
  }
}

async function saveAll(entries: StockSubscription[]): Promise<void> {
  await mkdir(dataDir, { recursive: true });
  const tmpPath = `${filePath}.${process.pid}.${randomUUID()}.tmp`;
  await writeFile(tmpPath, `${JSON.stringify(entries, null, 2)}\n`);
  await rename(tmpPath, filePath);
}
