"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  convertQuoteToOrder,
  createQuote,
  getQuoteByTrackingCode,
  updateQuoteStatus,
  type CreateQuoteItemInput
} from "../../lib/commercial-repository";

export async function submitQuoteAction(formData: FormData): Promise<void> {
  let target = "/quote";

  try {
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

  if (!quote) {
    redirect(`/quote/${encodeURIComponent(code)}?error=${encodeURIComponent("Teklif bulunamadi.")}`);
  }

  await updateQuoteStatus(quote.id, "APPROVED", quote.authorizedPerson || "Musteri", "Musteri teklifi onayladi.");
  const order = await convertQuoteToOrder(quote.id, quote.authorizedPerson || "Musteri", "customer");
  revalidateCommercialPaths();
  redirect(`/orders/${encodeURIComponent(order.trackingCode)}`);
}

export async function rejectQuoteByTrackingCodeAction(formData: FormData): Promise<void> {
  const code = getString(formData, "trackingCode");
  const quote = await getQuoteByTrackingCode(code);

  if (!quote) {
    redirect(`/quote/${encodeURIComponent(code)}?error=${encodeURIComponent("Teklif bulunamadi.")}`);
  }

  await updateQuoteStatus(quote.id, "REJECTED", quote.authorizedPerson || "Musteri", "Musteri teklifi reddetti.");
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

  const text = await file.text();
  return parseDelimitedQuoteItems(text);
}

function parseDelimitedQuoteItems(text: string): CreateQuoteItemInput[] {
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
  const priceIndex = hasHeader ? indexOf(["hedef fiyat", "target price", "fiyat"], 4) : 4;

  return rows
    .map((line) => {
      const cells = splitDelimitedLine(line, delimiter);
      return {
        sku: cells[skuIndex] ?? "",
        productName: cells[nameIndex] ?? "",
        quantity: Number(cells[quantityIndex] ?? "1"),
        unit: cells[unitIndex] || "Adet",
        targetPrice: cells[priceIndex] ?? ""
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

function revalidateCommercialPaths(): void {
  revalidatePath("/quote");
  revalidatePath("/orders");
  revalidatePath("/admin");
  revalidatePath("/admin/quotes");
  revalidatePath("/admin/orders");
}
