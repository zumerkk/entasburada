"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { addCartItems, clearCart, removeCartItem, updateCartQuantities, type CartItemInput } from "../../lib/cart-repository";
import { createOrderFromCustomerCart, createQuoteFromCustomerCart } from "../../lib/cart-checkout";
import { getOrderByTrackingCode } from "../../lib/commercial-repository";
import { trackCartEvent } from "../../lib/analytics-repository";
import { requireCustomer } from "../../lib/customer-auth";

export async function addQuickOrderItemsAction(formData: FormData): Promise<void> {
  const customer = await requireCustomer();
  const items = [...itemsFromForm(formData), ...(await itemsFromUpload(formData))];
  try {
    await addCartItems(customer, items, { catalogOnly: true });
  } catch (error) {
    redirect(`/quick-order?error=${encodeURIComponent(errorMessage(error, "Ürünler sepete eklenemedi."))}`);
  }
  await Promise.all(items.map((item) => trackCartEvent(customer, "cart_add", { productName: item.productName, sku: item.sku, quantity: item.quantity, unit: item.unit })));
  revalidateCartPaths();
  redirect("/cart");
}

export async function updateCartAction(formData: FormData): Promise<void> {
  const customer = await requireCustomer();
  const itemIds = formData.getAll("itemId").map(String);
  const cart = await updateCartQuantities(
    customer,
    itemIds.map((itemId) => ({
      itemId,
      quantity: Number(getString(formData, `quantity:${itemId}`))
    }))
  );
  await trackCartEvent(customer, "cart_add", { cartTotal: String(cart.items.length), quantity: cart.items.length });
  revalidateCartPaths();
  redirect("/cart");
}

export async function clearCartAction(): Promise<void> {
  const customer = await requireCustomer();
  await clearCart(customer);
  await trackCartEvent(customer, "cart_clear");
  revalidateCartPaths();
  redirect("/cart");
}

export async function removeCartItemAction(formData: FormData): Promise<void> {
  const customer = await requireCustomer();
  const itemId = getString(formData, "removeItemId");
  if (itemId) {
    await removeCartItem(customer, itemId);
    await trackCartEvent(customer, "cart_remove");
  }
  revalidateCartPaths();
  redirect("/cart");
}

export async function createQuoteFromCartAction(): Promise<void> {
  const customer = await requireCustomer();
  const quote = await createQuoteFromCustomerCart(customer);
  await trackCartEvent(customer, "quote_intent", { cartTotal: quote.totalAmount });
  revalidateCartPaths();
  redirect(`/quote/${encodeURIComponent(quote.trackingCode)}`);
}

export async function createOrderFromCartAction(): Promise<void> {
  const customer = await requireCustomer();
  const order = await createOrderFromCustomerCart(customer).catch((error) =>
    redirect(`/cart?error=${encodeURIComponent(errorMessage(error, "Sipariş oluşturulamadı."))}`)
  );
  await trackCartEvent(customer, "order_create", { cartTotal: order.totalAmount });
  revalidateCartPaths();
  redirect(`/orders/${encodeURIComponent(order.trackingCode)}`);
}

export async function reorderAction(formData: FormData): Promise<void> {
  const customer = await requireCustomer();
  const trackingCode = getString(formData, "trackingCode");
  if (!trackingCode) {
    redirect("/account?error=" + encodeURIComponent("Sipariş kodu bulunamadı."));
  }

  const order = await getOrderByTrackingCode(trackingCode);
  // Güvenlik: yalnızca kendi siparişini yeniden sipariş edebilir.
  if (!order || normalizeEmail(order.email) !== normalizeEmail(customer.email)) {
    redirect("/account?error=" + encodeURIComponent("Sipariş bulunamadı veya size ait değil."));
  }

  const items: CartItemInput[] = order.items
    .map((item) => ({
      sku: item.sku,
      productName: item.productName,
      quantity: Number(item.quantity) || 1,
      unit: item.unit || "Adet"
    }))
    .filter((item) => getClean(item.sku) || getClean(item.productName));

  if (items.length === 0) {
    redirect(`/orders/${encodeURIComponent(trackingCode)}?reorder=empty`);
  }

  try {
    await addCartItems(customer, items);
  } catch (error) {
    redirect(`/orders/${encodeURIComponent(trackingCode)}?reorder=error&msg=${encodeURIComponent(errorMessage(error, "Ürünler sepete eklenemedi."))}`);
  }

  await trackCartEvent(customer, "cart_add", { cartTotal: String(items.length), quantity: items.length });
  revalidateCartPaths();
  redirect("/cart?reorder=success");
}

function normalizeEmail(value: string): string {
  return (value || "").trim().toLocaleLowerCase("tr-TR");
}

function itemsFromForm(formData: FormData): CartItemInput[] {
  const skus = formData.getAll("itemSku").map(String);
  const names = formData.getAll("itemName").map(String);
  const quantities = formData.getAll("itemQuantity").map(String);
  const units = formData.getAll("itemUnit").map(String);

  return skus
    .map<CartItemInput>((sku, index) => ({
      sku,
      productName: names[index] ?? "",
      quantity: Number(quantities[index] ?? "1"),
      unit: units[index] ?? "Adet"
    }))
    .filter((item) => getClean(item.sku) || getClean(item.productName));
}

async function itemsFromUpload(formData: FormData): Promise<CartItemInput[]> {
  const file = formData.get("quickOrderFile");
  if (!(file instanceof File) || file.size === 0) {
    return [];
  }

  const text = await file.text();
  return parseDelimitedItems(text);
}

function parseDelimitedItems(text: string): CartItemInput[] {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length === 0) {
    return [];
  }

  const headerLine = lines[0] ?? "";
  const delimiter = headerLine.includes("\t") ? "\t" : headerLine.includes(";") ? ";" : ",";
  const first = splitDelimitedLine(headerLine, delimiter).map((cell) => cell.toLocaleLowerCase("tr-TR"));
  const hasHeader = first.some((cell) => ["sku", "urun", "ürün", "adet", "quantity", "miktar"].includes(cell));
  const rows = hasHeader ? lines.slice(1) : lines;
  const indexOf = (names: string[], fallback: number) => {
    const index = first.findIndex((cell) => names.includes(cell));
    return index === -1 ? fallback : index;
  };

  const skuIndex = hasHeader ? indexOf(["sku", "kod", "urun kodu", "ürün kodu", "barkod"], 0) : 0;
  const nameIndex = hasHeader ? indexOf(["urun", "ürün", "urun adi", "ürün adı", "product"], 1) : 1;
  const quantityIndex = hasHeader ? indexOf(["adet", "miktar", "quantity"], 2) : 2;
  const unitIndex = hasHeader ? indexOf(["birim", "unit"], 3) : 3;

  return rows
    .map((line) => {
      const cells = splitDelimitedLine(line, delimiter);
      return {
        sku: cells[skuIndex] ?? "",
        productName: cells[nameIndex] ?? "",
        quantity: Number(cells[quantityIndex] ?? "1"),
        unit: cells[unitIndex] || "Adet"
      };
    })
    .filter((item) => getClean(item.sku) || getClean(item.productName));
}

function splitDelimitedLine(line: string, delimiter: string): string[] {
  return line.split(delimiter).map((cell) => cell.trim().replace(/^"|"$/g, ""));
}

function getString(formData: FormData, key: string): string {
  return getClean(formData.get(key));
}

function getClean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

function revalidateCartPaths(): void {
  revalidatePath("/cart");
  revalidatePath("/quick-order");
  revalidatePath("/account");
  revalidatePath("/admin");
  revalidatePath("/admin/quotes");
  revalidatePath("/admin/orders");
}
