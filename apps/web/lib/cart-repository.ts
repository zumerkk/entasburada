import "server-only";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { toPublicProduct, type CatalogProductRecord } from "@entas/catalog";
import { loadCatalogStore } from "./catalog-repository";
import { MAX_CART_LINES, normalizeCartQuantity, summarizeCartPricing, type CartPricingPolicy } from "./cart-policy";
import type { CustomerAccount } from "./customer-auth";
import { formatMoney, money, parseMoney, priceProductForCustomer, priceUnavailableMessage } from "./customer-pricing";

export interface CartItemInput {
  productSlug?: string | undefined;
  sku?: string | undefined;
  productName?: string | undefined;
  quantity?: number | undefined;
  unit?: string | undefined;
}

export interface CartItem {
  id: string;
  sku: string;
  productName: string;
  productSlug?: string | undefined;
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
  slug?: string;
  image?: string;
  brand?: string;
  category?: string;
  stockStatus?: string;
  stockLabel?: string;
  minOrder: number;
  unitNetPrice: string;
  displayUnitPrice: string;
  lineTotal: string;
  displayLineTotal: string;
  priceAvailable: boolean;
  discountRate?: string;
  priceRuleLabel?: string;
  priceLabel?: string;
  priceUnavailableMessage?: string;
  taxRate: number;
  includedTaxAmount: string;
  displayIncludedTax: string;
  currency: string;
}

export interface CartSummary extends CartPricingPolicy {
  customerId: string;
  updatedAt: string;
  items: PricedCartItem[];
  totalAmount: string;
  displayTotal: string;
  currency: string;
}

const rootDir = findWorkspaceRoot(process.cwd());
const dataDir = process.env.ENTAS_CART_DATA_DIR ? path.resolve(process.env.ENTAS_CART_DATA_DIR) : path.join(rootDir, "data");
const cartsPath = path.join(dataDir, "carts.json");
let cartMutationQueue: Promise<void> = Promise.resolve();

export class CartInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CartInputError";
  }
}

export async function addCartItems(
  customer: CustomerAccount,
  inputs: CartItemInput[],
  options: { catalogOnly?: boolean } = {}
): Promise<CustomerCart> {
  return mutateCart(async () => {
    if (inputs.length > 50) throw new CartInputError("Tek seferde en fazla 50 ürün eklenebilir.");
    const [rows, store] = await Promise.all([loadCarts(), loadCatalogStore()]);
    const index = rows.findIndex((cart) => cart.customerId === customer.id);
    const existing = index === -1 ? createEmptyCart(customer.id) : rows[index]!;
    const now = new Date().toISOString();
    const nextItems = existing.items.map((item) => ({ ...item }));

    for (const input of inputs) {
      const sku = clean(input.sku);
      const productName = clean(input.productName);
      if (!sku && !productName) continue;

      const product = findCatalogProduct(store.products, clean(input.productSlug), sku, productName);
      if (!product && options.catalogOnly) {
        throw new CartInputError(`${sku || productName} aktif katalogda bulunamadı veya birden fazla ürünle eşleşti.`);
      }

      const normalizedSku = product?.sku || sku || customSku(productName);
      const minimum = product?.minOrder ?? 1;
      const quantity = normalizeCartQuantity(input.quantity, minimum);
      const existingItem = nextItems.find((item) =>
        product
          ? item.productSlug === product.slug || (!item.productSlug && normalize(item.sku) === normalize(normalizedSku) && normalize(item.productName) === normalize(product.name))
          : normalize(item.sku) === normalize(normalizedSku) && normalize(item.productName) === normalize(productName)
      );

      if (existingItem) {
        existingItem.quantity = normalizeCartQuantity(existingItem.quantity + quantity, minimum);
        existingItem.productName = product?.name || productName || existingItem.productName;
        existingItem.productSlug = product?.slug || existingItem.productSlug;
        existingItem.unit = product?.unitType || clean(input.unit) || existingItem.unit;
        continue;
      }

      nextItems.push({
        id: `cart-item-${randomUUID()}`,
        sku: normalizedSku,
        productName: product?.name || productName || normalizedSku,
        productSlug: product?.slug,
        quantity,
        unit: product?.unitType || clean(input.unit) || "Adet",
        addedAt: now
      });
    }

    if (nextItems.length > MAX_CART_LINES) throw new CartInputError(`Sepette en fazla ${MAX_CART_LINES} farklı ürün bulunabilir.`);
    const nextCart: CustomerCart = { customerId: customer.id, updatedAt: now, items: nextItems };
    if (index === -1) rows.unshift(nextCart);
    else rows[index] = nextCart;

    await saveCarts(rows);
    return nextCart;
  });
}

export async function updateCartQuantities(customer: CustomerAccount, quantities: Array<{ itemId: string; quantity: number }>): Promise<CustomerCart> {
  return mutateCart(async () => {
    const [rows, store] = await Promise.all([loadCarts(), loadCatalogStore()]);
    const index = rows.findIndex((cart) => cart.customerId === customer.id);
    const existing = index === -1 ? createEmptyCart(customer.id) : rows[index]!;
    const quantityById = new Map(quantities.map((item) => [item.itemId, item.quantity]));
    const nextCart: CustomerCart = {
      customerId: customer.id,
      updatedAt: new Date().toISOString(),
      items: existing.items.flatMap((item) => {
        const requested = quantityById.get(item.id);
        if (requested == null) return [{ ...item }];
        if (Number(requested) <= 0) return [];
        const product = findCatalogProduct(store.products, item.productSlug ?? "", item.sku, item.productName);
        return [{ ...item, quantity: normalizeCartQuantity(requested, product?.minOrder ?? 1), unit: product?.unitType || item.unit }];
      })
    };

    if (index === -1) rows.unshift(nextCart);
    else rows[index] = nextCart;
    await saveCarts(rows);
    return nextCart;
  });
}

export async function clearCart(customer: CustomerAccount): Promise<void> {
  await mutateCart(async () => {
    const rows = await loadCarts();
    const index = rows.findIndex((cart) => cart.customerId === customer.id);
    if (index === -1) return;
    rows[index] = createEmptyCart(customer.id);
    await saveCarts(rows);
  });
}

export async function removeCartItem(customer: CustomerAccount, itemId: string): Promise<CustomerCart> {
  return mutateCart(async () => {
    const rows = await loadCarts();
    const index = rows.findIndex((cart) => cart.customerId === customer.id);
    const existing = index === -1 ? createEmptyCart(customer.id) : rows[index]!;
    const nextCart: CustomerCart = {
      customerId: customer.id,
      updatedAt: new Date().toISOString(),
      items: existing.items.filter((item) => item.id !== itemId)
    };
    if (index === -1) rows.unshift(nextCart);
    else rows[index] = nextCart;
    await saveCarts(rows);
    return nextCart;
  });
}

export async function loadCustomerCart(customer: CustomerAccount): Promise<CustomerCart> {
  await cartMutationQueue;
  const rows = await loadCarts();
  return rows.find((cart) => cart.customerId === customer.id) ?? createEmptyCart(customer.id);
}

export async function loadPricedCart(customer: CustomerAccount): Promise<CartSummary> {
  const [cart, store] = await Promise.all([loadCustomerCart(customer), loadCatalogStore()]);
  const items = cart.items.map((item) => priceCartItem(item, customer, store.products));
  const policy = summarizeCartPricing(items);
  const singleTotal = policy.totals.length === 1 ? policy.totals[0] : undefined;
  return {
    customerId: customer.id,
    updatedAt: cart.updatedAt,
    items,
    totalAmount: singleTotal?.totalAmount ?? "0.00",
    displayTotal: policy.totals.map((total) => total.displayTotal).join(" + ") || formatMoney(0, "TRY"),
    currency: singleTotal?.currency ?? (policy.totals.length > 1 ? "MULTI" : "TRY"),
    ...policy
  };
}

async function loadCarts(): Promise<CustomerCart[]> {
  await ensureFile();
  return readJson<CustomerCart[]>(cartsPath, []);
}

async function saveCarts(rows: CustomerCart[]): Promise<void> {
  await mkdir(dataDir, { recursive: true });
  const tmpPath = `${cartsPath}.${process.pid}.${randomUUID()}.tmp`;
  await writeFile(tmpPath, `${JSON.stringify(rows, null, 2)}\n`, { mode: 0o600 });
  await rename(tmpPath, cartsPath);
}

async function ensureFile(): Promise<void> {
  if (existsSync(cartsPath)) {
    return;
  }

  await mkdir(dataDir, { recursive: true });
  await writeFile(cartsPath, "[]\n", { mode: 0o600 });
}

function priceCartItem(item: CartItem, customer: CustomerAccount, products: CatalogProductRecord[]): PricedCartItem {
  const product = findCatalogProduct(products, item.productSlug ?? "", item.sku, item.productName);
  const publicProduct = product ? toPublicProduct(product) : null;
  const currency = product?.currency === "TL" ? "TRY" : product?.currency || "TRY";
  const price = product ? priceProductForCustomer(product, customer) : null;
  const unitPrice = price ? parseMoney(price.unitNetPrice) : 0;
  const lineTotal = unitPrice * item.quantity;
  const includedTaxAmount = price ? parseMoney(price.includedTaxAmount) * item.quantity : 0;

  return stripUndefined({
    ...item,
    productName: product?.name || item.productName,
    unit: product?.unitType || item.unit,
    slug: publicProduct?.slug,
    image: publicProduct?.image,
    brand: product?.brand,
    category: publicProduct?.category,
    stockStatus: product?.stockStatus,
    stockLabel: publicProduct?.stockLabel,
    minOrder: publicProduct?.minOrder ?? 1,
    unitNetPrice: money(unitPrice),
    displayUnitPrice: price?.displayPrice ?? formatMoney(0, currency),
    lineTotal: money(lineTotal),
    displayLineTotal: formatMoney(lineTotal, currency),
    priceAvailable: Boolean(price && unitPrice > 0),
    discountRate: price?.discountRate,
    priceRuleLabel: price?.ruleLabel,
    priceLabel: price?.priceLabel,
    priceUnavailableMessage: product ? priceUnavailableMessage(product) : undefined,
    taxRate: Number(product?.taxRate.replace(",", ".")) || 0,
    includedTaxAmount: money(includedTaxAmount),
    displayIncludedTax: formatMoney(includedTaxAmount, currency),
    currency
  }) as PricedCartItem;
}

function createEmptyCart(customerId: string): CustomerCart {
  return { customerId, updatedAt: new Date().toISOString(), items: [] };
}

function findCatalogProduct(products: CatalogProductRecord[], productSlug: string, sku: string, productName: string): CatalogProductRecord | undefined {
  const eligibleProducts = products.filter((product) => product.status === "ACTIVE" && product.isVisible);
  const normalizedSlug = normalize(productSlug);
  const normalizedSku = normalize(sku);
  const normalizedName = normalize(productName);

  if (normalizedSlug) {
    const slugMatches = eligibleProducts.filter((product) => normalize(product.slug) === normalizedSlug);
    if (slugMatches.length === 1) return slugMatches[0];
    return undefined;
  }

  if (normalizedSku) {
    const matches = eligibleProducts.filter((product) =>
      [product.sku, product.barcode ?? "", product.manufacturerCode ?? ""].some((value) => normalize(value) === normalizedSku)
    );
    if (matches.length === 1) return matches[0];
    if (matches.length > 1 && normalizedName) {
      const namedMatches = matches.filter((product) => normalize(product.name) === normalizedName);
      return namedMatches.length === 1 ? namedMatches[0] : undefined;
    }
    if (matches.length > 1) return undefined;
  }

  if (normalizedName) {
    const exactMatches = eligibleProducts.filter((product) => normalize(product.name) === normalizedName);
    return exactMatches.length === 1 ? exactMatches[0] : undefined;
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

function customSku(productName: string): string {
  const code = normalize(productName).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48);
  return `OZEL-${code || randomUUID().slice(0, 8)}`.toUpperCase();
}

function mutateCart<T>(operation: () => Promise<T>): Promise<T> {
  const result = cartMutationQueue.then(operation, operation);
  cartMutationQueue = result.then(() => undefined, () => undefined);
  return result;
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
    if (isWorkspaceRoot(current)) {
      return current;
    }

    current = path.dirname(current);
  }

  return startDir;
}

function isWorkspaceRoot(dir: string): boolean {
  return (
    existsSync(path.join(dir, "pnpm-workspace.yaml")) ||
    existsSync(path.join(dir, "data", "catalog-store.json")) ||
    existsSync(path.join(dir, "data", "customer-accounts.json"))
  );
}
