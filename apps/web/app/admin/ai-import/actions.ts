"use server";

import { revalidatePath } from "next/cache";
import { getAdminEmail, requireAdmin } from "../../../lib/admin-auth";
import {
  approveImportJob,
  createPdfImportJobFromFile,
  createXmlImportJob,
  createXmlImportJobFromFile,
  processPdfImportBatch,
  rejectImportJob,
  updateImportProduct
} from "../../../lib/smart-import-repository";

export async function createXmlSmartImportAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const file = formData.get("xmlFile");
  const xmlText = getString(formData, "xmlText");
  const xmlUrl = getString(formData, "xmlUrl");

  if (file instanceof File && file.size > 0) {
    await createXmlImportJobFromFile(file, getAdminEmail());
  } else if (xmlText) {
    await createXmlImportJob({ xml: xmlText, sourceName: getString(formData, "sourceName") || "XML metin import", actor: getAdminEmail() });
  } else if (xmlUrl) {
    const response = await fetch(xmlUrl, { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`XML URL okunamadi: ${response.status}`);
    }
    await createXmlImportJob({ xml: await response.text(), sourceName: xmlUrl, fileName: xmlUrl, actor: getAdminEmail() });
  }

  revalidateImportPaths();
}

export async function createPdfSmartImportAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const file = formData.get("pdfFile");
  if (!(file instanceof File) || file.size === 0) {
    throw new Error("PDF dosyası zorunlu.");
  }

  const startPage = getNumber(formData, "startPage");
  const endPage = getNumber(formData, "endPage");
  await createPdfImportJobFromFile(file, getAdminEmail(), {
    sourceName: getString(formData, "sourceName"),
    brandHint: getString(formData, "brandHint"),
    categoryHint: getString(formData, "categoryHint"),
    defaultCurrency: getString(formData, "defaultCurrency") || "TRY",
    ...(startPage === undefined ? {} : { startPage }),
    ...(endPage === undefined ? {} : { endPage })
  });
  revalidateImportPaths();
}

export async function processPdfSmartImportAction(formData: FormData): Promise<void> {
  await requireAdmin();
  await processPdfImportBatch(getString(formData, "jobId"), 1);
  revalidateImportPaths();
}

export async function approveSmartImportAction(formData: FormData): Promise<void> {
  await requireAdmin();
  await approveImportJob(getString(formData, "jobId"), getAdminEmail());
  revalidateImportPaths();
}

export async function rejectSmartImportAction(formData: FormData): Promise<void> {
  await requireAdmin();
  await rejectImportJob(getString(formData, "jobId"), getAdminEmail());
  revalidateImportPaths();
}

export async function updateSmartImportProductAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const jobId = getString(formData, "jobId");
  await updateImportProduct(jobId, getString(formData, "productId"), {
    sku: getString(formData, "sku"),
    barcode: getString(formData, "barcode"),
    manufacturerCode: getString(formData, "manufacturerCode"),
    productName: getString(formData, "productName"),
    brandName: getString(formData, "brandName"),
    categoryName: getString(formData, "categoryName"),
    listPrice: getString(formData, "listPrice"),
    currency: getString(formData, "currency"),
    taxRate: getString(formData, "taxRate"),
    unitType: getString(formData, "unitType"),
    stockQuantity: getNumber(formData, "stockQuantity") ?? 0,
    stockStatus: toStockStatus(getString(formData, "stockStatus")),
    stockQuantityKnown: formData.get("stockQuantityKnown") === "on",
    description: getString(formData, "description"),
    technicalSpecs: getString(formData, "technicalSpecs"),
    imageUrl: formData.get("removeImage") === "on" ? "" : getString(formData, "imageUrl"),
    minOrder: getNumber(formData, "minOrder") ?? 1,
    packageQuantity: getNumber(formData, "packageQuantity") ?? 1,
    cartonQuantity: getNumber(formData, "cartonQuantity") ?? 1,
    palletQuantity: getNumber(formData, "palletQuantity") ?? 1,
    warrantyMonths: getNumber(formData, "warrantyMonths") ?? 0,
    excluded: formData.get("excluded") === "on"
  });
  revalidateImportPaths();
  revalidatePath(`/admin/ai-import/${jobId}`);
}

function revalidateImportPaths(): void {
  revalidatePath("/admin/ai-import");
  revalidatePath("/admin/products");
  revalidatePath("/admin/import");
  revalidatePath("/catalog");
}

function getString(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function getNumber(formData: FormData, key: string): number | undefined {
  const value = getString(formData, key);
  const parsed = Number(value);
  return value && Number.isFinite(parsed) ? parsed : undefined;
}

function toStockStatus(value: string): "in_stock" | "low_stock" | "incoming" | "out_of_stock" {
  return value === "in_stock" || value === "low_stock" || value === "incoming" || value === "out_of_stock" ? value : "out_of_stock";
}
