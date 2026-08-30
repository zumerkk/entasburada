"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { addCartItems } from "../../lib/cart-repository";
import { createQuote } from "../../lib/commercial-repository";
import { requireCustomer } from "../../lib/customer-auth";
import { parseMaterialListFile, type MaterialListRow } from "../../lib/material-list-parser";
import { createCustomerProject, deleteCustomerProject, getCustomerProject, linkProjectQuote, selectProjectItemMatch } from "../../lib/project-repository";

export async function createProjectAction(formData: FormData): Promise<void> {
  const customer = await requireCustomer();
  try {
    const manualRows = rowsFromForm(formData);
    const file = formData.get("materialFile");
    const uploadedRows = file instanceof File && file.size > 0 ? await parseMaterialListFile(file) : [];
    const project = await createCustomerProject(customer, {
      name: getString(formData, "name"),
      code: getString(formData, "code"),
      jobsite: getString(formData, "jobsite"),
      deliveryAddress: getString(formData, "deliveryAddress"),
      desiredDeliveryDate: getString(formData, "desiredDeliveryDate"),
      note: getString(formData, "note"),
      items: [...manualRows, ...uploadedRows]
    });
    revalidateProjectPaths();
    redirect(`/projects/${project.id}`);
  } catch (error) {
    redirect(`/projects/new?error=${encodeURIComponent(message(error, "Proje oluşturulamadı."))}`);
  }
}

export async function selectProjectMatchAction(formData: FormData): Promise<void> {
  const customer = await requireCustomer();
  const projectId = getString(formData, "projectId");
  try {
    await selectProjectItemMatch(customer, projectId, getString(formData, "itemId"), getString(formData, "productSlug"));
    revalidateProjectPaths(projectId);
    redirect(`/projects/${projectId}?ok=${encodeURIComponent("Ürün eşleşmesi güncellendi.")}`);
  } catch (error) {
    redirect(`/projects/${projectId}?error=${encodeURIComponent(message(error, "Eşleşme güncellenemedi."))}`);
  }
}

export async function addProjectToCartAction(formData: FormData): Promise<void> {
  const customer = await requireCustomer();
  const projectId = getString(formData, "projectId");
  const project = await getCustomerProject(customer, projectId);
  if (!project) redirect("/projects?error=" + encodeURIComponent("Proje bulunamadı."));
  const items = project.items
    .filter((item) => item.selectedMatch)
    .map((item) => ({
      sku: item.selectedMatch!.sku,
      productName: item.selectedMatch!.productName,
      quantity: item.quantity,
      unit: item.unit
    }));
  if (items.length === 0) redirect(`/projects/${projectId}?error=${encodeURIComponent("Sepete eklenebilecek eşleşmiş ürün yok.")}`);
  await addCartItems(customer, items, { catalogOnly: true });
  revalidatePath("/cart");
  revalidatePath("/account");
  redirect("/cart?project=success");
}

export async function createProjectQuoteAction(formData: FormData): Promise<void> {
  const customer = await requireCustomer();
  const projectId = getString(formData, "projectId");
  const project = await getCustomerProject(customer, projectId);
  if (!project) redirect("/projects?error=" + encodeURIComponent("Proje bulunamadı."));
  const quote = await createQuote({
    companyTitle: customer.companyName,
    authorizedPerson: customer.authorizedPerson,
    phone: customer.phone,
    email: customer.email,
    projectName: project.name,
    projectCode: project.code,
    deliveryCity: customer.city,
    deliveryAddress: project.deliveryAddress,
    paymentPreference: "Bayi çalışma koşulları",
    notes: [project.note, project.desiredDeliveryDate ? `İstenen teslim: ${project.desiredDeliveryDate}` : ""].filter(Boolean).join(" · "),
    items: project.items.map((item) => ({
      sku: item.selectedMatch?.sku || item.requestedSku,
      productName: item.selectedMatch?.productName || item.requestedName,
      quantity: item.quantity,
      unit: item.unit,
      targetPrice: item.targetPrice,
      targetDeliveryDate: project.desiredDeliveryDate
    }))
  });
  await linkProjectQuote(customer, projectId, quote.trackingCode);
  revalidateProjectPaths(projectId);
  redirect(`/quote/${encodeURIComponent(quote.trackingCode)}`);
}

export async function deleteProjectAction(formData: FormData): Promise<void> {
  const customer = await requireCustomer();
  await deleteCustomerProject(customer, getString(formData, "projectId"));
  revalidateProjectPaths();
  redirect("/projects?ok=" + encodeURIComponent("Proje arşivden kaldırıldı."));
}

function rowsFromForm(formData: FormData): MaterialListRow[] {
  const skus = formData.getAll("itemSku").map(String);
  const names = formData.getAll("itemName").map(String);
  const quantities = formData.getAll("itemQuantity").map(String);
  const units = formData.getAll("itemUnit").map(String);
  return skus.map((sku, index) => ({
    sku: sku.trim(),
    productName: (names[index] ?? "").trim(),
    quantity: Math.max(1, Number(quantities[index] ?? "1") || 1),
    unit: (units[index] ?? "Adet").trim() || "Adet",
    targetPrice: "",
    note: ""
  })).filter((item) => item.sku || item.productName);
}

function getString(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function message(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

function revalidateProjectPaths(projectId?: string) {
  revalidatePath("/projects");
  if (projectId) revalidatePath(`/projects/${projectId}`);
  revalidatePath("/account");
  revalidatePath("/admin/quotes");
}
