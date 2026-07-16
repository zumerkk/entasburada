"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getAdminEmail } from "../../lib/admin-auth";
import { publishDraftProducts, publishProductIds, syncImportedProducts } from "../../lib/catalog-repository";
import { requireAdmin } from "../../lib/admin-auth";
import {
  convertQuoteToOrder,
  priceQuote,
  updateOrderOperation,
  updateQuoteStatus,
  type OrderStatus,
  type QuoteStatus
} from "../../lib/commercial-repository";
import {
  getDealerApplication,
  recordApplicationProvisioning,
  updateDealerApplicationStatus,
  type DealerApplicationStatus
} from "../../lib/dealer-application-repository";
import { provisionDealerAccount } from "../../lib/dealer-provisioning";

export async function syncImportAction(): Promise<void> {
  await requireAdmin();
  await syncImportedProducts({ publishNew: false, actor: getAdminEmail() });
  revalidateCatalogPaths();
}

export async function syncAndPublishAction(): Promise<void> {
  await requireAdmin();
  await syncImportedProducts({ publishNew: true, actor: getAdminEmail() });
  revalidateCatalogPaths();
}

export async function publishAllDraftAction(): Promise<void> {
  await requireAdmin();
  await publishDraftProducts(getAdminEmail());
  revalidateCatalogPaths();
}

export async function publishSelectedAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const ids = formData
    .getAll("productId")
    .map((value) => String(value))
    .filter(Boolean);

  await publishProductIds(ids, getAdminEmail());
  revalidateCatalogPaths();
}

export async function updateQuoteStatusAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const quoteId = getString(formData, "quoteId");
  const status = toQuoteStatus(getString(formData, "status"));
  const quote = await updateQuoteStatus(quoteId, status, getAdminEmail());
  revalidateCommercialPaths(quote.trackingCode);
}

export async function priceQuoteAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const itemIds = formData.getAll("itemId").map(String);
  const quote = await priceQuote(
    {
      quoteId: getString(formData, "quoteId"),
      validUntil: getString(formData, "validUntil"),
      salesRepresentative: getString(formData, "salesRepresentative"),
      internalNote: getString(formData, "internalNote"),
      prices: itemIds.map((itemId) => ({
        itemId,
        quotedUnitPrice: getString(formData, `price:${itemId}`)
      }))
    },
    getAdminEmail()
  );

  revalidateCommercialPaths(quote.trackingCode);
}

export async function convertQuoteToOrderAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const order = await convertQuoteToOrder(getString(formData, "quoteId"), getAdminEmail());
  revalidateCommercialPaths(order.trackingCode);
  redirect(`/admin/orders/${order.id}`);
}

export async function updateOrderOperationAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const order = await updateOrderOperation(
    {
      orderId: getString(formData, "orderId"),
      status: toOrderStatus(getString(formData, "status")),
      paymentStatus: getString(formData, "paymentStatus"),
      financeApproval: getString(formData, "financeApproval"),
      stockStatus: getString(formData, "stockStatus"),
      shipmentStatus: getString(formData, "shipmentStatus"),
      warehouse: getString(formData, "warehouse"),
      internalNote: getString(formData, "internalNote")
    },
    getAdminEmail()
  );

  revalidateCommercialPaths(order.trackingCode);
}

export async function updateDealerApplicationStatusAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const applicationId = getString(formData, "applicationId");
  const status = toDealerStatus(getString(formData, "status"));
  const note = getString(formData, "reviewNote");
  await updateDealerApplicationStatus(applicationId, status, getAdminEmail(), note);

  // Onay = bayi hesabini otomatik ac; giris bilgileri basvuru kartinda gosterilir
  if (status === "approved") {
    const application = await getDealerApplication(applicationId);
    if (application && !application.accountId) {
      const result = await provisionDealerAccount(application);
      await recordApplicationProvisioning(applicationId, {
        accountId: result.accountId,
        accountEmail: result.email,
        ...(result.tempPassword ? { tempPassword: result.tempPassword } : {}),
        welcomeMailSent: result.mailSent,
        note:
          result.status === "created"
            ? `Bayi hesabı açıldı (${result.email})${result.mailSent ? "; hoş geldin e-postası gönderildi." : "; e-posta altyapısı kapalı, bilgileri WhatsApp ile iletin."}`
            : `${result.email} için hesap zaten vardı; yeni hesap açılmadı.`
      });
    }
  }

  revalidatePath("/admin/dealers");
  revalidatePath("/admin");
  revalidatePath("/admin/notifications");
}

function toDealerStatus(value: string): DealerApplicationStatus {
  const statuses: DealerApplicationStatus[] = ["pending", "reviewing", "approved", "rejected"];
  if (statuses.includes(value as DealerApplicationStatus)) {
    return value as DealerApplicationStatus;
  }

  throw new Error("Gecersiz basvuru durumu.");
}

function revalidateCatalogPaths(): void {
  revalidatePath("/");
  revalidatePath("/catalog");
  revalidatePath("/admin");
  revalidatePath("/admin/products");
  revalidatePath("/admin/import");
  revalidatePath("/admin/integrations");
}

function revalidateCommercialPaths(trackingCode?: string): void {
  revalidatePath("/admin");
  revalidatePath("/admin/quotes");
  revalidatePath("/admin/orders");
  revalidatePath("/orders");

  if (trackingCode) {
    revalidatePath(`/quote/${trackingCode}`);
    revalidatePath(`/orders/${trackingCode}`);
  }
}

function getString(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function toQuoteStatus(value: string): QuoteStatus {
  const statuses: QuoteStatus[] = ["DRAFT", "SUBMITTED", "ASSIGNED", "PRICED", "APPROVED", "REJECTED", "EXPIRED", "CONVERTED"];
  if (statuses.includes(value as QuoteStatus)) {
    return value as QuoteStatus;
  }

  throw new Error("Gecersiz teklif durumu.");
}

function toOrderStatus(value: string): OrderStatus {
  const statuses: OrderStatus[] = [
    "DRAFT",
    "PAYMENT_PENDING",
    "APPROVAL_PENDING",
    "FINANCE_APPROVAL_PENDING",
    "STOCK_WAITING",
    "PREPARING",
    "READY_TO_SHIP",
    "SHIPPED",
    "DELIVERED",
    "CANCELLED",
    "COMPLETED"
  ];
  if (statuses.includes(value as OrderStatus)) {
    return value as OrderStatus;
  }

  throw new Error("Gecersiz siparis durumu.");
}
