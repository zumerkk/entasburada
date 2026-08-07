import "server-only";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

/**
 * Bayi favorileri / kayıtlı listesi. Müşteri başına favori SKU kümesi.
 * B2B'de sık alınan ürünleri işaretleyip hızlı erişim + reorder için.
 */

export interface FavoriteEntry {
  customerId: string;
  sku: string;
  productName: string;
  productSlug?: string | undefined;
  addedAt: string;
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
const favoritesPath = path.join(dataDir, "customer-favorites.json");
let favoritesMutationQueue: Promise<void> = Promise.resolve();

function mutateFavorites<T>(operation: () => Promise<T>): Promise<T> {
  const result = favoritesMutationQueue.then(operation, operation);
  favoritesMutationQueue = result.then(() => undefined, () => undefined);
  return result;
}

export async function listFavorites(customerId: string): Promise<FavoriteEntry[]> {
  const all = await readAll();
  return all
    .filter((entry) => entry.customerId === customerId)
    .sort((a, b) => (a.addedAt < b.addedAt ? 1 : -1));
}

export async function getFavoriteSkus(customerId: string): Promise<Set<string>> {
  const entries = await listFavorites(customerId);
  return new Set(entries.map((entry) => normalizeSku(entry.sku)));
}

export async function isFavorite(customerId: string, sku: string, productSlug = ""): Promise<boolean> {
  const entries = await listFavorites(customerId);
  const key = productIdentity(sku, productSlug);
  return entries.some((entry) => productIdentity(entry.sku, entry.productSlug ?? "") === key);
}

/** Favoriyi ekler/çıkarır; sonuçta favori mi (true) değil mi (false) döner. */
export function toggleFavorite(input: { customerId: string; sku: string; productName: string; productSlug?: string }): Promise<boolean> {
  return mutateFavorites(() => toggleFavoriteUnlocked(input));
}

async function toggleFavoriteUnlocked(input: { customerId: string; sku: string; productName: string; productSlug?: string }): Promise<boolean> {
  const sku = input.sku.trim();
  if (!sku) throw new Error("Ürün kodu (SKU) zorunlu.");

  const all = await readAll();
  const productSlug = input.productSlug?.trim().slice(0, 240) ?? "";
  const key = productIdentity(sku, productSlug);
  const existingIndex = all.findIndex((entry) => entry.customerId === input.customerId && productIdentity(entry.sku, entry.productSlug ?? "") === key);

  if (existingIndex !== -1) {
    all.splice(existingIndex, 1);
    await saveAll(all);
    return false;
  }

  all.push({ customerId: input.customerId, sku, productName: input.productName.trim().slice(0, 300) || sku, ...(productSlug ? { productSlug } : {}), addedAt: new Date().toISOString() });
  await saveAll(all);
  return true;
}

function productIdentity(sku: string, productSlug: string): string {
  const slug = productSlug.trim().toLowerCase();
  return slug ? `slug:${slug}` : `sku:${normalizeSku(sku)}`;
}

function normalizeSku(value: string): string {
  return value.trim().toLocaleLowerCase("tr-TR");
}

async function readAll(): Promise<FavoriteEntry[]> {
  try {
    return JSON.parse(await readFile(favoritesPath, "utf8")) as FavoriteEntry[];
  } catch {
    return [];
  }
}

async function saveAll(entries: FavoriteEntry[]): Promise<void> {
  await mkdir(dataDir, { recursive: true, mode: 0o700 });
  const tmpPath = `${favoritesPath}.${process.pid}.${randomUUID()}.tmp`;
  await writeFile(tmpPath, `${JSON.stringify(entries, null, 2)}\n`, { mode: 0o600 });
  await rename(tmpPath, favoritesPath);
}
