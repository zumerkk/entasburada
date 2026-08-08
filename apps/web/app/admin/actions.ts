"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getAdminEmail } from "../../lib/admin-auth";
import {
  bulkApplyPriceMarkup,
  bulkDeleteProducts,
  bulkSetProductsStatus,
  countSyncedSourceProducts,
  getAdminProductIdsByFilter,
  publishDraftProducts,
  publishProductIds,
  syncImportedProducts,
  updateCatalogProduct
} from "../../lib/catalog-repository";
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

/**
 * Toplu islemin hedefini cozer.
 *
 * `scope=filtered` secildiginde sayfadaki kutucuklar degil, mevcut filtreye uyan
 * TUM urunler hedeflenir; 9.208 urunluk katalogda 50'lik sayfalarla calismak
 * pratik olmadigi icin bu secenek gerekli. Filtre degerleri formda gizli
 * alanlarla tasinir ki sunucu tarafinda ayni kume yeniden hesaplanabilsin.
 */
async function resolveBulkTargetIds(formData: FormData): Promise<string[]> {
  if (getString(formData, "scope") === "filtered") {
    // exactOptionalPropertyTypes acik: bos alanlar hic eklenmemeli, undefined atanmamali.
    const q = getString(formData, "f_q");
    const brand = getString(formData, "f_brand");
    const sourceKey = getString(formData, "f_sourceKey");

    const priceState = getString(formData, "f_priceState");
    const imageState = getString(formData, "f_imageState");

    return getAdminProductIdsByFilter({
      ...(q ? { q } : {}),
      ...(brand ? { brand } : {}),
      ...(sourceKey ? { sourceKey } : {}),
      status: toProductStatusFilter(getString(formData, "f_status")),
      stockStatus: toStockStatusFilter(getString(formData, "f_stockStatus")),
      priceState: priceState === "priced" || priceState === "zero" ? priceState : "all",
      imageState: imageState === "with" || imageState === "without" ? imageState : "all"
    });
  }

  return formData
    .getAll("productId")
    .map((value) => String(value))
    .filter(Boolean);
}

function bulkReturnTo(formData: FormData): string {
  const raw = getString(formData, "returnTo");
  return raw.startsWith("/admin/products") ? raw : "/admin/products";
}

function redirectWith(returnTo: string, key: "ok" | "error", message: string): never {
  redirect(`${returnTo}${returnTo.includes("?") ? "&" : "?"}${key}=${encodeURIComponent(message)}`);
}

export async function bulkSetStatusAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const returnTo = bulkReturnTo(formData);
  const status = getString(formData, "targetStatus") === "ACTIVE" ? "ACTIVE" : "PASSIVE";
  const ids = await resolveBulkTargetIds(formData);
  if (ids.length === 0) redirectWith(returnTo, "error", "Ürün seçilmedi.");

  const changed = await bulkSetProductsStatus(ids, status, getAdminEmail());
  revalidateCatalogPaths();
  redirectWith(
    returnTo,
    "ok",
    `${changed.toLocaleString("tr-TR")} ürün ${status === "ACTIVE" ? "yayına alındı" : "pasife alındı"}.`
  );
}

export async function bulkPriceMarkupAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const returnTo = bulkReturnTo(formData);
  const percent = Number(getString(formData, "markupPercent").replace(",", "."));
  if (!Number.isFinite(percent) || percent === 0) {
    redirectWith(returnTo, "error", "Geçerli bir yüzde girin (örnek: 30 veya -10).");
  }
  if (percent <= -100 || percent > 900) {
    redirectWith(returnTo, "error", "Yüzde -100 ile 900 arasında olmalıdır.");
  }

  const ids = await resolveBulkTargetIds(formData);
  if (ids.length === 0) redirectWith(returnTo, "error", "Ürün seçilmedi.");

  // redirect() ozel bir hata firlattigi icin basari yolu try blogunun DISINDA
  // kalmali; aksi halde yonlendirme kendi catch'imize takilir.
  const outcome = await bulkApplyPriceMarkup(
    ids,
    { multiplier: 1 + percent / 100, rounding: getString(formData, "rounding") === "integer" ? "integer" : "none" },
    getAdminEmail()
  ).catch((error: unknown) => {
    redirectWith(returnTo, "error", error instanceof Error ? error.message : "Fiyat güncellenemedi.");
  });

  const synced = await countSyncedSourceProducts(ids);
  revalidateCatalogPaths();

  const parts = [`${outcome.updated.toLocaleString("tr-TR")} ürünün fiyatı %${percent} güncellendi.`];
  if (outcome.skippedZeroPrice > 0) {
    parts.push(`${outcome.skippedZeroPrice.toLocaleString("tr-TR")} ürün fiyatsız olduğu için atlandı.`);
  }
  // XML'den senkronize olan kaynaklarda bu zam bir sonraki senkronda silinir.
  if (synced > 0) {
    parts.push(
      `Dikkat: ${synced.toLocaleString("tr-TR")} ürün XML'den senkronize olan bir kaynaktan geliyor; sonraki senkronda bu fiyatlar tedarikçi fiyatına döner.`
    );
  }
  redirectWith(returnTo, "ok", parts.join(" "));
}

export async function bulkDeleteProductsAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const returnTo = bulkReturnTo(formData);
  if (getString(formData, "confirmDelete") !== "on") {
    redirectWith(returnTo, "error", "Kalıcı silme için önce onay kutusunu işaretleyin.");
  }

  // "Filtreye uyan hepsi" + bos filtre = tum katalog. Tek yanlis tikla 9.000'den
  // fazla urunun silinmesini engellemek icin en az bir daraltici filtre sart.
  if (getString(formData, "scope") === "filtered") {
    const hasNarrowingFilter = ["f_q", "f_brand", "f_sourceKey"].some((key) => getString(formData, key)) ||
      toProductStatusFilter(getString(formData, "f_status")) !== "all" ||
      toStockStatusFilter(getString(formData, "f_stockStatus")) !== "all" ||
      ["priced", "zero"].includes(getString(formData, "f_priceState")) ||
      ["with", "without"].includes(getString(formData, "f_imageState"));

    if (!hasNarrowingFilter) {
      redirectWith(
        returnTo,
        "error",
        "Tüm katalogu birden silemezsiniz. Önce kaynak, marka, durum veya arama filtresiyle daraltın; ya da satırları tek tek seçin."
      );
    }
  }

  const ids = await resolveBulkTargetIds(formData);
  if (ids.length === 0) redirectWith(returnTo, "error", "Ürün seçilmedi.");

  const deleted = await bulkDeleteProducts(ids, getAdminEmail());
  revalidateCatalogPaths();
  redirectWith(
    returnTo,
    "ok",
    `${deleted.toLocaleString("tr-TR")} ürün kalıcı olarak silindi. Geri getirmek için ilgili kaynağı yeniden içe aktarmanız gerekir.`
  );
}

/** Satir icinden tek urun silme. Toplu silmeden ayri: onay kutusu yerine
 *  satirdaki dugme zaten tek bir urunu hedefler ve geri donusu nettir. */
export async function deleteSingleProductAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const returnTo = bulkReturnTo(formData);
  const productId = getString(formData, "productId");
  if (!productId) redirectWith(returnTo, "error", "Ürün seçilmedi.");

  const deleted = await bulkDeleteProducts([productId], getAdminEmail());
  revalidateCatalogPaths();
  redirectWith(
    returnTo,
    deleted > 0 ? "ok" : "error",
    deleted > 0 ? "Ürün katalogdan silindi." : "Ürün bulunamadı; silinmiş olabilir."
  );
}

/** Admin panelinden tek ürün düzenleme (ad, fiyat, stok, durum, görsel...). */
export async function updateProductAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const productId = getString(formData, "productId");
  if (!productId) {
    redirect("/admin/products?error=" + encodeURIComponent("Ürün seçilmedi."));
  }

  // Sayfa/filtre kaybolmasın diye dönüş adresi formdan taşınır.
  const rawReturn = getString(formData, "returnTo");
  const returnTo = rawReturn.startsWith("/admin/products") ? rawReturn : "/admin/products";

  try {
    await updateCatalogProduct(
      productId,
      {
        name: getString(formData, "name"),
        brand: getString(formData, "brand"),
        category: getString(formData, "category"),
        listPrice: getString(formData, "listPrice"),
        currency: getString(formData, "currency"),
        stockQuantity: Number(getString(formData, "stockQuantity")),
        unitType: getString(formData, "unitType"),
        imageUrl: getString(formData, "imageUrl"),
        description: getString(formData, "description"),
        barcode: getString(formData, "barcode"),
        manufacturerCode: getString(formData, "manufacturerCode"),
        taxRate: getString(formData, "taxRate"),
        minOrder: Number(getString(formData, "minOrder")),
        packageQuantity: Number(getString(formData, "packageQuantity")),
        cartonQuantity: Number(getString(formData, "cartonQuantity")),
        status: toProductStatus(getString(formData, "status")),
        isVisible: getString(formData, "isVisible") === "on"
      },
      getAdminEmail()
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Ürün güncellenemedi.";
    redirect(`${returnTo}${returnTo.includes("?") ? "&" : "?"}error=${encodeURIComponent(message)}`);
  }

  revalidatePath("/admin/products");
  revalidatePath("/catalog");
  redirect(`${returnTo}${returnTo.includes("?") ? "&" : "?"}ok=${encodeURIComponent("Ürün güncellendi.")}`);
}

function toProductStatus(value: string): "ACTIVE" | "DRAFT" | "PASSIVE" | undefined {
  return value === "ACTIVE" || value === "DRAFT" || value === "PASSIVE" ? value : undefined;
}

/** Filtre alanlari icin: gecersiz deger "tum kayitlar" anlamina gelir. */
function toProductStatusFilter(value: string): "ACTIVE" | "DRAFT" | "PASSIVE" | "all" {
  return toProductStatus(value) ?? "all";
}

function toStockStatusFilter(value: string): "in_stock" | "low_stock" | "incoming" | "out_of_stock" | "all" {
  return value === "in_stock" || value === "low_stock" || value === "incoming" || value === "out_of_stock" ? value : "all";
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

  let application;
  try {
    application = await createDealerApplication({
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
  } catch (error) {
    redirect("/admin/dealers?error=" + encodeURIComponent(error instanceof Error ? error.message : "Başvuru kaydedilemedi."));
  }

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
