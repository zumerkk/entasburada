import "server-only";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import type { CatalogProductRecord } from "@entas/catalog";
import { loadCatalogStore } from "./catalog-repository";
import type { CustomerAccount } from "./customer-auth";
import { formatMoney, money, parseMoney, priceProductForCustomer } from "./customer-pricing";

export interface CartItemInput {
  sku?: string;
  productName?: string;
  quantity?: number;
  unit?: string;
}

export interface CartItem {
  id: string;
  sku: string;
  productName: string;
  quantity: number;
  unit: string;
  addedAt: string;
}

export interface CustomerCart {
  customerId: string;
  updatedAt: string;
  items: CartItem[];
}

export interface PricedCartItem extends CartItem {
  brand?: string;
  category?: string;
  stockStatus?: string;
  unitNetPrice: string;
  displayUnitPrice: string;
  lineTotal: string;
  displayLineTotal: string;
  discountRate?: string;
  priceRuleLabel?: string;
  currency: string;
}

export interface CartSummary {
  customerId: string;
  updatedAt: string;
  items: PricedCartItem[];
  totalAmount: string;
  displayTotal: string;
  currency: string;
}

const rootDir = findWorkspaceRoot(process.cwd());
const dataDir = path.join(rootDir, "data");
const cartsPath = path.join(dataDir, "carts.json");

export async function addCartItems(customer: CustomerAccount, inputs: CartItemInput[]): Promise<CustomerCart> {
  const rows = await loadCarts();
  const index = rows.findIndex((cart) => cart.customerId === customer.id);
  const existing = index === -1 ? createEmptyCart(customer.id) : rows[index]!;
  const products = (await loadCatalogStore()).products;
  const now = new Date().toISOString();
  const nextItems = [...existing.items];

  for (const input of inputs) {
    const sku = clean(input.sku);
    const productName = clean(input.productName);
    if (!sku && !productName) {
      continue;
    }

    const product = findCatalogProduct(products, sku, productName);
    const normalizedSku = product?.sku || sku;
    const quantity = Math.max(1, Math.trunc(Number(input.quantity) || 1));
    const existingItem = nextItems.find((item) => normalize(item.sku) === normalize(normalizedSku));

    if (existingItem) {
      existingItem.quantity += quantity;
      continue;
    }

    nextItems.push({
      id: `cart-item-${randomUUID()}`,
      sku: normalizedSku || "OZEL-URUN",
      productName: product?.name || productName || normalizedSku,
      quantity,
      unit: clean(input.unit) || product?.unitType || "Adet",
      addedAt: now
    });
  }

  const nextCart: CustomerCart = { customerId: customer.id, updatedAt: now, items: nextItems };
  if (index === -1) {
    rows.unshift(nextCart);
  } else {
    rows[index] = nextCart;
  }

  await saveCarts(rows);
  return nextCart;
}

export async function updateCartQuantities(customer: CustomerAccount, quantities: Array<{ itemId: string; quantity: number }>): Promise<CustomerCart> {
  const rows = await loadCarts();
  const index = rows.findIndex((cart) => cart.customerId === customer.id);
  const existing = index === -1 ? createEmptyCart(customer.id) : rows[index]!;
  const quantityById = new Map(quantities.map((item) => [item.itemId, Math.max(0, Math.trunc(item.quantity || 0))]));
  const nextCart: CustomerCart = {
    customerId: customer.id,
    updatedAt: new Date().toISOString(),
    items: existing.items
      .map((item) => ({ ...item, quantity: quantityById.get(item.id) ?? item.quantity }))
      .filter((item) => item.quantity > 0)
  };

  if (index === -1) {
    rows.unshift(nextCart);
  } else {
    rows[index] = nextCart;
  }

  await saveCarts(rows);
  return nextCart;
}

export async function clearCart(customer: CustomerAccount): Promise<void> {
  const rows = await loadCarts();
  const index = rows.findIndex((cart) => cart.customerId === customer.id);
  if (index === -1) {
    return;
  }

  rows[index] = createEmptyCart(customer.id);
  await saveCarts(rows);
}

export async function loadCustomerCart(customer: CustomerAccount): Promise<CustomerCart> {
  const rows = await loadCarts();
  return rows.find((cart) => cart.customerId === customer.id) ?? createEmptyCart(customer.id);
}

export async function loadPricedCart(customer: CustomerAccount): Promise<CartSummary> {
  const [cart, store] = await Promise.all([loadCustomerCart(customer), loadCatalogStore()]);
  const items = cart.items.map((item) => priceCartItem(item, customer, store.products));
  const total = items.reduce((sum, item) => sum + parseMoney(item.lineTotal), 0);
  const currency = items[0]?.currency ?? "TRY";
  return {
    customerId: customer.id,
    updatedAt: cart.updatedAt,
    items,
    totalAmount: money(total),
    displayTotal: formatMoney(total, currency),
    currency
  };
}

async function loadCarts(): Promise<CustomerCart[]> {
  await ensureFile();
  return readJson<CustomerCart[]>(cartsPath, []);
}

async function saveCarts(rows: CustomerCart[]): Promise<void> {
  await mkdir(dataDir, { recursive: true });
  const tmpPath = `${cartsPath}.${process.pid}.tmp`;
  await writeFile(tmpPath, `${JSON.stringify(rows, null, 2)}\n`);
  await rename(tmpPath, cartsPath);
}

async function ensureFile(): Promise<void> {
  if (existsSync(cartsPath)) {
    return;
  }

  await mkdir(dataDir, { recursive: true });
  await writeFile(cartsPath, "[]\n");
}

function priceCartItem(item: CartItem, customer: CustomerAccount, products: CatalogProductRecord[]): PricedCartItem {
  const product = findCatalogProduct(products, item.sku, item.productName);
  const currency = product?.currency === "TL" ? "TRY" : product?.currency || "TRY";
  const price = product ? priceProductForCustomer(product, customer) : null;
  const unitPrice = price ? parseMoney(price.unitNetPrice) : 0;
  const lineTotal = unitPrice * item.quantity;

  return stripUndefined({
    ...item,
    productName: product?.name || item.productName,
    brand: product?.brand,
    category: product?.category,
    stockStatus: product?.stockStatus,
    unitNetPrice: money(unitPrice),
    displayUnitPrice: price?.displayPrice ?? formatMoney(0, currency),
    lineTotal: money(lineTotal),
    displayLineTotal: formatMoney(lineTotal, currency),
    discountRate: price?.discountRate,
    priceRuleLabel: price?.ruleLabel,
    currency
  }) as PricedCartItem;
}

function createEmptyCart(customerId: string): CustomerCart {
  return { customerId, updatedAt: new Date().toISOString(), items: [] };
}

function findCatalogProduct(products: CatalogProductRecord[], sku: string, productName: string): CatalogProductRecord | undefined {
  const normalizedSku = normalize(sku);
  const normalizedName = normalize(productName);

  if (normalizedSku) {
    const exact = products.find((product) =>
      [product.sku, product.barcode ?? "", product.manufacturerCode ?? ""].some((value) => normalize(value) === normalizedSku)
    );
    if (exact) {
      return exact;
    }

    const loose = products.find((product) => normalize(product.name).includes(normalizedSku));
    if (loose) {
      return loose;
    }
  }

  if (normalizedName) {
    return products.find((product) => normalize(product.name).includes(normalizedName) || normalizedName.includes(normalize(product.name)));
  }

  return undefined;
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

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalize(value: string): string {
  return clean(value)
    .toLocaleLowerCase("tr-TR")
    .replace(/[ç]/g, "c")
    .replace(/[ğ]/g, "g")
    .replace(/[ı]/g, "i")
    .replace(/[ö]/g, "o")
    .replace(/[ş]/g, "s")
    .replace(/[ü]/g, "u");
}

function stripUndefined<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map(stripUndefined) as T;
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, entry]) => entry !== undefined)
        .map(([key, entry]) => [key, stripUndefined(entry)])
    ) as T;
  }

  return value;
}

function findWorkspaceRoot(startDir: string): string {
  let current = startDir;

  while (current !== path.dirname(current)) {
    if (existsSync(path.join(current, "pnpm-workspace.yaml"))) {
      return current;
    }

    current = path.dirname(current);
  }

  return startDir;
}
