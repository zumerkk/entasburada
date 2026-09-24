"use server";

import { getCurrentCustomer, resolveSellerReferral, sellerReferenceCode } from "../../lib/customer-auth";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createDealerApplication, type DealerApplicationInput } from "../../lib/dealer-application-repository";
import { dealerApplicationSchema } from "@entas/validation";
import { consumeRateLimit } from "../../lib/rate-limit";
import { getClientAddress } from "../../lib/security";

const REQUIRED_FIELDS: Array<[keyof DealerApplicationInput, string]> = [
  ["companyTitle", "Firma ünvanı"],
  ["taxOffice", "Vergi dairesi"],
  ["taxNumber", "Vergi numarası"],
  ["companyType", "Firma tipi"],
  ["authorizedPerson", "Yetkili kişi"],
  ["phone", "Telefon"],
  ["email", "E-posta"],
  ["invoiceAddress", "Fatura adresi"],
  ["deliveryAddress", "Teslimat adresi"],
  ["city", "İl"],
  ["district", "İlçe"]
];

export async function submitDealerApplicationAction(formData: FormData): Promise<{ error: string }> {
  const sellerEntry = formData.get("sellerEntry") === "1";
  const seller = sellerEntry ? await getCurrentCustomer() : null;
  if (sellerEntry && (!seller?.sellerAccess?.enabled || (seller.companyId ?? seller.id) !== seller.id)) return { error: "Satıcı oturumunuz geçersiz. Tekrar giriş yapın." };
  const rateLimit = await consumeRateLimit(seller ? "seller-customer-registration" : "dealer-application", seller?.id ?? getClientAddress(await headers()), { limit: seller ? 30 : 5, windowMs: 60 * 60 * 1000 });
  if (!rateLimit.allowed) {
    return { error: "Çok fazla başvuru gönderildi. Lütfen daha sonra tekrar deneyin." };
  }
  const value = (key: string): string => String(formData.get(key) ?? "").trim();

  const input: DealerApplicationInput = {
    companyTitle: value("companyTitle"),
    taxOffice: value("taxOffice"),
    taxNumber: value("taxNumber"),
    tradeRegistryNumber: value("tradeRegistryNumber") || undefined,
    mersisNumber: value("mersisNumber") || undefined,
    companyType: value("companyType"),
    authorizedPerson: value("authorizedPerson"),
    phone: value("phone"),
    whatsapp: value("whatsapp") || undefined,
    email: value("email"),
    invoiceAddress: value("invoiceAddress"),
    deliveryAddress: formData.get("sameAddress") === "on" ? value("invoiceAddress") : value("deliveryAddress"),
    city: value("city"),
    district: value("district"),
    activityArea: value("activityArea"),
    annualPurchaseVolume: value("annualPurchaseVolume") || undefined,
    dealershipType: value("dealershipType") || undefined,
    referenceCompany: value("referenceCompany") || undefined,
    kvkkAccepted: formData.get("kvkkAccepted") != null,
    commercialConsent: formData.get("commercialConsent") != null
  };

  const missing = REQUIRED_FIELDS.filter(([key]) => !input[key]).map(([, label]) => label);
  if (missing.length > 0) {
    return { error: "Zorunlu alanlar: " + missing.join(", ") };
  }

  if (!input.kvkkAccepted) {
    return { error: "KVKK onayı zorunludur." };
  }

  const parsed = dealerApplicationSchema.safeParse(input);
  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? "Başvuru bilgileri geçersiz.";
    return { error: message };
  }

  let destination = "/dealer-application";
  let reference = "";
  try {
    let code = value("referralCode");
    if (seller) {
      code = sellerReferenceCode(seller);
      destination = "/satici";
    }
    const referral = await resolveSellerReferral(code, input.email, sellerEntry ? "seller" : "code");
    const application = await createDealerApplication({ ...parsed.data as DealerApplicationInput, ...(referral ? { referral } : {}) });
    reference = application.reference;
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Başvuru kaydedilemedi." };
  }
  redirect(`${destination}?submitted=${encodeURIComponent(reference)}`);
}
