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
  createDealerApplication,
  getDealerApplication,
  recordApplicationProvisioning,
  updateDealerApplicationStatus,
  type DealerApplicationStatus
} from "../../lib/dealer-application-repository";
import { dealerProfile, provisionDealerAccount } from "../../lib/dealer-provisioning";
import { updateCustomerAccount, type CustomerSegment } from "../../lib/customer-auth";

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
      carrier: getString(formData, "carrier"),
      trackingNumber: getString(formData, "trackingNumber"),
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

/**
 * Elden (yüz yüze) alınan bayi başvurusunu sisteme girer.
 *
 * Halka açık form müşteri tarafından doldurulur; bu aksiyon ise başvuruyu kâğıt
 * üzerinde alıp panele işleyen admin içindir. Başvuru "pending" durumda oluşur,
 * normal onay akışına girer — hesap ancak onaylandığında açılır.
 *
 * KVKK/ticari izin kutuları admin tarafından İŞARETLENMEK ZORUNDA: müşteriden
 * fiilen alınmış onayı beyan eder, otomatik varsayılmaz.
 */
export async function createManualDealerApplicationAction(formData: FormData): Promise<void> {
  await requireAdmin();

  const required = (key: string) => getString(formData, key);
  const companyTitle = required("companyTitle");
  const authorizedPerson = required("authorizedPerson");
  const phone = required("phone");
  const email = required("email");

  if (!companyTitle || !authorizedPerson || !phone || !email) {
    redirect("/admin/dealers?error=" + encodeURIComponent("Firma, yetkili, telefon ve e-posta zorunlu."));
  }
  if (getString(formData, "kvkkAccepted") !== "on") {
    redirect("/admin/dealers?error=" + encodeURIComponent("KVKK onayının alındığını işaretlemelisiniz."));
  }

  const invoiceAddress = required("invoiceAddress");
  const deliveryAddress = required("deliveryAddress") || invoiceAddress;

  const application = await createDealerApplication({
    companyTitle,
    taxOffice: required("taxOffice"),
    taxNumber: required("taxNumber"),
    mersisNumber: required("mersisNumber") || undefined,
    companyType: required("companyType") || "Hırdavat bayisi",
    authorizedPerson,
    phone,
    whatsapp: required("whatsapp") || undefined,
    email,
    invoiceAddress,
    deliveryAddress,
    city: required("city"),
    district: required("district"),
    activityArea: required("activityArea") || "Hırdavat",
    dealershipType: required("dealershipType") || undefined,
    kvkkAccepted: true,
    commercialConsent: getString(formData, "commercialConsent") === "on"
  });

  revalidatePath("/admin/dealers");
  revalidatePath("/admin");
  redirect(
    "/admin/dealers?ok=" +
      encodeURIComponent(`Elden başvuru kaydedildi: ${application.reference} (onay bekliyor).`)
  );
}

const DEALER_SEGMENTS: CustomerSegment[] = ["standard", "industrial", "project"];

/**
 * Mevcut bir bayinin firma adı / yetkili / segment (kademe) bilgisini günceller.
 * Segment değişince tam tier profili (iskonto, kredi, perks...) otomatik uygulanır.
 */
export async function updateDealerAccountAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const customerId = getString(formData, "customerId");
  const companyName = getString(formData, "companyName");
  const authorizedPerson = getString(formData, "authorizedPerson");
  const rawSegment = getString(formData, "segment");
  const segment = DEALER_SEGMENTS.includes(rawSegment as CustomerSegment) ? (rawSegment as CustomerSegment) : "standard";

  if (!customerId) {
    redirect("/admin/dealers?error=" + encodeURIComponent("Bayi seçilmedi."));
  }

  await updateCustomerAccount(customerId, {
    ...(companyName ? { companyName } : {}),
    ...(authorizedPerson ? { authorizedPerson } : {}),
    segment,
    // Segmentin tam kademe profili (tierName/tierRank/iskonto/kredi/perks...) tutarlı uygulanır.
    ...dealerProfile(segment)
  });

  revalidatePath("/admin/dealers");
  revalidatePath("/account");
  redirect("/admin/dealers?ok=" + encodeURIComponent("Bayi güncellendi."));
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
