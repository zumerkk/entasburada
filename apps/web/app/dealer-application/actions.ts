"use server";

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
  ["district", "İlçe"],
  ["activityArea", "Faaliyet alanı"]
];

export async function submitDealerApplicationAction(formData: FormData): Promise<void> {
  const rateLimit = await consumeRateLimit("dealer-application", getClientAddress(await headers()), { limit: 5, windowMs: 60 * 60 * 1000 });
  if (!rateLimit.allowed) {
    redirect(`/dealer-application?error=${encodeURIComponent("Çok fazla başvuru gönderildi. Lütfen daha sonra tekrar deneyin.")}`);
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
    deliveryAddress: value("deliveryAddress"),
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
    redirect(`/dealer-application?error=${encodeURIComponent(missing.join(", "))}`);
  }

  if (!input.kvkkAccepted) {
    redirect(`/dealer-application?error=${encodeURIComponent("KVKK onayı zorunludur")}`);
  }

  const parsed = dealerApplicationSchema.safeParse(input);
  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? "Başvuru bilgileri geçersiz.";
    redirect(`/dealer-application?error=${encodeURIComponent(message)}`);
  }

  const application = await createDealerApplication(parsed.data as DealerApplicationInput);
  redirect(`/dealer-application?submitted=${encodeURIComponent(application.reference)}`);
}
