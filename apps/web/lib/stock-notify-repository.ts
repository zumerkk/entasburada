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
let stockSubscriptionMutationQueue: Promise<void> = Promise.resolve();

function mutateSubscriptions<T>(operation: () => Promise<T>): Promise<T> {
  const result = stockSubscriptionMutationQueue.then(operation, operation);
  stockSubscriptionMutationQueue = result.then(() => undefined, () => undefined);
  return result;
}

function normalizeSku(value: string): string {
  return value.trim().toLocaleLowerCase("tr-TR");
}

export async function listStockSubscriptions(customerId: string): Promise<StockSubscription[]> {
  const all = await readAll();
  return all.filter((entry) => entry.customerId === customerId).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

export function subscribeToStock(input: {
  customerId: string;
  email: string;
  sku: string;
  productName: string;
  productSlug: string;
}): Promise<void> {
  return mutateSubscriptions(() => subscribeToStockUnlocked(input));
}

async function subscribeToStockUnlocked(input: {
  customerId: string;
  email: string;
  sku: string;
  productName: string;
  productSlug: string;
}): Promise<void> {
  const sku = input.sku.trim();
  if (!sku) return;
  const all = await readAll();
  const productSlug = input.productSlug.trim().slice(0, 240);
  const key = productIdentity(sku, productSlug);
  const already = all.some((entry) => entry.customerId === input.customerId && productIdentity(entry.sku, entry.productSlug) === key);
  if (already) return;

  all.push({
    id: `stocksub-${randomUUID()}`,
    customerId: input.customerId,
    email: input.email,
    sku,
    productName: input.productName.trim().slice(0, 300) || sku,
    productSlug,
    createdAt: new Date().toISOString()
  });
  await saveAll(all);
}

export function unsubscribeFromStock(customerId: string, sku: string, productSlug = ""): Promise<void> {
  return mutateSubscriptions(() => unsubscribeFromStockUnlocked(customerId, sku, productSlug));
}

async function unsubscribeFromStockUnlocked(customerId: string, sku: string, productSlug: string): Promise<void> {
  const all = await readAll();
  const key = productIdentity(sku, productSlug);
  const next = all.filter((entry) => !(entry.customerId === customerId && productIdentity(entry.sku, entry.productSlug) === key));
  if (next.length !== all.length) await saveAll(next);
}

export async function isSubscribedToStock(customerId: string, sku: string, productSlug = ""): Promise<boolean> {
  const all = await readAll();
  const key = productIdentity(sku, productSlug);
  return all.some((entry) => entry.customerId === customerId && productIdentity(entry.sku, entry.productSlug) === key);
}

/**
 * Verilen SKU'lar tekrar stoğa girdiğinde abonelere bildirim gönderir ve
 * bu SKU'lara ait abonelikleri (tek-seferlik) siler. Catalog sync'ten çağrılır.
 */
export function notifyRestockedProducts(products: Array<{ sku: string; productSlug: string }>): Promise<number> {
  return mutateSubscriptions(() => notifyRestockedProductsUnlocked(products));
}

async function notifyRestockedProductsUnlocked(products: Array<{ sku: string; productSlug: string }>): Promise<number> {
  if (products.length === 0) return 0;
  const restocked = new Set(products.map((product) => productIdentity(product.sku, product.productSlug)));
  const all = await readAll();
  const toNotify = all.filter((entry) => restocked.has(productIdentity(entry.sku, entry.productSlug)));
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

  const remaining = all.filter((entry) => !restocked.has(productIdentity(entry.sku, entry.productSlug)));
  await saveAll(remaining);
  return toNotify.length;
}

function productIdentity(sku: string, productSlug: string): string {
  const slug = productSlug.trim().toLowerCase();
  return slug ? `slug:${slug}` : `sku:${normalizeSku(sku)}`;
}

async function readAll(): Promise<StockSubscription[]> {
  try {
    return JSON.parse(await readFile(filePath, "utf8")) as StockSubscription[];
  } catch {
    return [];
  }
}

async function saveAll(entries: StockSubscription[]): Promise<void> {
  await mkdir(dataDir, { recursive: true, mode: 0o700 });
  const tmpPath = `${filePath}.${process.pid}.${randomUUID()}.tmp`;
  await writeFile(tmpPath, `${JSON.stringify(entries, null, 2)}\n`, { mode: 0o600 });
  await rename(tmpPath, filePath);
}
