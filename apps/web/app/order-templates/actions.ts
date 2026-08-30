"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { addCartItems } from "../../lib/cart-repository";
import { requireCustomer } from "../../lib/customer-auth";
import { listFavorites } from "../../lib/favorites-repository";
import { deleteOrderTemplate, listOrderTemplates, markTemplateUsed, saveCartAsTemplate, type OrderTemplateFrequency } from "../../lib/order-template-repository";

export async function saveCartTemplateAction(formData: FormData): Promise<void> {
  const customer = await requireCustomer();
  try {
    await saveCartAsTemplate(customer, value(formData, "name"), frequency(value(formData, "frequency")));
  } catch (error) {
    redirect(`/cart?error=${encodeURIComponent(message(error, "Şablon kaydedilemedi."))}`);
  }
  revalidatePaths();
  redirect("/order-templates?ok=" + encodeURIComponent("Sepet sipariş şablonu olarak kaydedildi."));
}

export async function applyOrderTemplateAction(formData: FormData): Promise<void> {
  const customer = await requireCustomer();
  const template = (await listOrderTemplates(customer)).find((entry) => entry.id === value(formData, "templateId"));
  if (!template) redirect("/order-templates?error=" + encodeURIComponent("Şablon bulunamadı."));
  await addCartItems(customer, template.items.map((item) => ({ sku: item.sku, productName: item.productName, quantity: item.quantity, unit: item.unit })));
  await markTemplateUsed(customer, template.id);
  revalidatePaths();
  redirect("/cart?template=success");
}

export async function addFavoritesToCartAction(): Promise<void> {
  const customer = await requireCustomer();
  const favorites = await listFavorites(customer.id);
  if (favorites.length === 0) redirect("/account?error=" + encodeURIComponent("Favori ürününüz bulunmuyor.") + "#favorites");
  await addCartItems(customer, favorites.map((item) => ({ sku: item.sku, productName: item.productName, quantity: 1, unit: "Adet" })));
  revalidatePaths();
  redirect("/cart?favorites=success");
}

export async function deleteOrderTemplateAction(formData: FormData): Promise<void> {
  const customer = await requireCustomer();
  await deleteOrderTemplate(customer, value(formData, "templateId"));
  revalidatePaths();
  redirect("/order-templates?ok=" + encodeURIComponent("Şablon silindi."));
}

function value(formData: FormData, key: string) { const raw = formData.get(key); return typeof raw === "string" ? raw.trim() : ""; }
function frequency(value: string): OrderTemplateFrequency { return value === "WEEKLY" || value === "MONTHLY" ? value : "ON_DEMAND"; }
function message(error: unknown, fallback: string) { return error instanceof Error && error.message ? error.message : fallback; }
function revalidatePaths() { revalidatePath("/order-templates"); revalidatePath("/cart"); revalidatePath("/account"); }
