"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  applyOrderCompanyApprovalPolicy,
  convertQuoteToOrder,
  createQuote,
  getQuoteByTrackingCode,
  recordQuoteCustomerResponse,
  updateQuoteStatus,
  type CreateQuoteItemInput
} from "../../lib/commercial-repository";
import { getCurrentCustomer } from "../../lib/customer-auth";
import { canAccessCommercialRecord } from "../../lib/commercial-access";
import { headers } from "next/headers";
import { consumeRateLimit } from "../../lib/rate-limit";
import { getClientAddress } from "../../lib/security";
import { parseMaterialListFile } from "../../lib/material-list-parser";

export async function submitQuoteAction(formData: FormData): Promise<void> {
  let target = "/quote";

  try {
    const rateLimit = await consumeRateLimit("public-quote-action", getClientAddress(await headers()), { limit: 10, windowMs: 60 * 60 * 1000 });
    if (!rateLimit.allowed) throw new Error("Çok fazla teklif isteği gönderildi. Lütfen daha sonra tekrar deneyin.");
    const items = [...itemsFromForm(formData), ...(await itemsFromUpload(formData))];
    const quote = await createQuote({
      companyTitle: getString(formData, "companyTitle"),
      authorizedPerson: getString(formData, "authorizedPerson"),
      phone: getString(formData, "phone"),
      email: getString(formData, "email"),
      projectName: getString(formData, "projectName"),
      projectCode: getString(formData, "projectCode"),
      deliveryCity: getString(formData, "deliveryCity"),
      deliveryAddress: getString(formData, "deliveryAddress"),
      paymentPreference: getString(formData, "paymentPreference"),
      notes: getString(formData, "notes"),
      allowPartialShipment: getString(formData, "allowPartialShipment") === "on",
      items
    });

    revalidateCommercialPaths();
    target = `/quote/success?code=${encodeURIComponent(quote.trackingCode)}`;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Teklif kaydi olusturulamadi.";
    target = `/quote?error=${encodeURIComponent(message)}`;
  }

  redirect(target);
}

export async function approveQuoteByTrackingCodeAction(formData: FormData): Promise<void> {
  const code = getString(formData, "trackingCode");
  const quote = await getQuoteByTrackingCode(code);
  const customer = await getCurrentCustomer();

  if (!quote || !canAccessCommercialRecord(quote, customer) || !["PRICED", "APPROVED"].includes(quote.status)) {
    redirect(`/quote/${encodeURIComponent(code)}?error=${encodeURIComponent("Teklif bulunamadi.")}`);
  }

  const selected = formData.getAll("acceptedItemId").map(String).filter((itemId) => quote.items.some((item) => item.id === itemId));
  const acceptedItemIds = selected.length > 0 ? selected : quote.items.map((item) => item.id);
  await recordQuoteCustomerResponse(
    { quoteId: quote.id, acceptedItemIds, note: getString(formData, "responseNote") },
    quote.authorizedPerson || "Müşteri"
  );
  const createdOrder = await convertQuoteToOrder(quote.id, quote.authorizedPerson || "Müşteri", "customer", acceptedItemIds);
  const order = customer ? await applyOrderCompanyApprovalPolicy(createdOrder.id, customer) : createdOrder;
  revalidateCommercialPaths();
  redirect(`/orders/${encodeURIComponent(order.trackingCode)}`);
}

export async function requestQuoteRevisionByTrackingCodeAction(formData: FormData): Promise<void> {
  const code = getString(formData, "trackingCode");
  const quote = await getQuoteByTrackingCode(code);
  const customer = await getCurrentCustomer();
  if (!quote || !canAccessCommercialRecord(quote, customer) || !["PRICED", "APPROVED"].includes(quote.status)) {
    redirect(`/quote/${encodeURIComponent(code)}?error=${encodeURIComponent("Teklif bulunamadı.")}`);
  }
  const acceptedItemIds = formData.getAll("acceptedItemId").map(String).filter((itemId) => quote.items.some((item) => item.id === itemId));
  const note = getString(formData, "responseNote");
  if (note.length < 3) redirect(`/quote/${encodeURIComponent(code)}?error=${encodeURIComponent("Revizyon talebinizi kısa bir notla açıklayın.")}`);
  await recordQuoteCustomerResponse({ quoteId: quote.id, acceptedItemIds, note, requestRevision: true }, quote.authorizedPerson || "Müşteri");
  revalidateCommercialPaths();
  redirect(`/quote/${encodeURIComponent(code)}?revision=requested`);
}

export async function rejectQuoteByTrackingCodeAction(formData: FormData): Promise<void> {
  const code = getString(formData, "trackingCode");
  const quote = await getQuoteByTrackingCode(code);
  const customer = await getCurrentCustomer();

  if (!quote || !canAccessCommercialRecord(quote, customer) || !["PRICED", "SUBMITTED", "ASSIGNED"].includes(quote.status)) {
    redirect(`/quote/${encodeURIComponent(code)}?error=${encodeURIComponent("Teklif bulunamadi.")}`);
  }

  const note = getString(formData, "responseNote");
  await updateQuoteStatus(quote.id, "REJECTED", quote.authorizedPerson || "Müşteri", note ? `Müşteri teklifi reddetti: ${note}` : "Müşteri teklifi reddetti.");
  revalidateCommercialPaths();
  redirect(`/quote/${encodeURIComponent(quote.trackingCode)}`);
}

function itemsFromForm(formData: FormData): CreateQuoteItemInput[] {
  const skus = formData.getAll("itemSku").map(String);
  const names = formData.getAll("itemName").map(String);
  const quantities = formData.getAll("itemQuantity").map(String);
  const units = formData.getAll("itemUnit").map(String);
  const targetPrices = formData.getAll("itemTargetPrice").map(String);
  const targetDeliveryDates = formData.getAll("itemTargetDeliveryDate").map(String);

  return skus
    .map<CreateQuoteItemInput>((sku, index) => ({
      sku,
      productName: names[index] ?? "",
      quantity: Number(quantities[index] ?? "1"),
      unit: units[index] ?? "Adet",
      targetPrice: targetPrices[index] ?? "",
      targetDeliveryDate: targetDeliveryDates[index] ?? ""
    }))
    .filter((item) => getClean(item.sku) || getClean(item.productName));
}

async function itemsFromUpload(formData: FormData): Promise<CreateQuoteItemInput[]> {
  const file = formData.get("quoteFile");
  if (!(file instanceof File) || file.size === 0) {
    return [];
  }
  return (await parseMaterialListFile(file)).map((row) => ({
    sku: row.sku,
    productName: row.productName,
    quantity: row.quantity,
    unit: row.unit,
    targetPrice: row.targetPrice
  }));
}

function getString(formData: FormData, key: string): string {
  return getClean(formData.get(key));
}

function getClean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function revalidateCommercialPaths(): void {
  revalidatePath("/quote");
  revalidatePath("/orders");
  revalidatePath("/admin");
  revalidatePath("/admin/quotes");
  revalidatePath("/admin/orders");
}
