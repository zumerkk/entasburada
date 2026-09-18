import type { CatalogProductRecord } from "@entas/catalog";
import type { CustomerAccount } from "./customer-auth";
import { includedVatAmount, priceMultiplier, resolveProductPricePolicy, roundMoney, SELLER_CHANNEL_PREMIUM_RATE } from "./commercial-policy";

export interface CustomerPrice {
  visible: true;
  unitNetPrice: string;
  displayPrice: string;
  listPrice?: string;
  discountRate?: string;
  ruleLabel: string;
  priceLabel?: string;
  taxIncluded: true;
  includedTaxAmount: string;
}

/** Satıcı kanal farkı al-sat/dropshipping hesaplarına uygulanır; pazarlamacı (referral) müşterilerle aynı fiyatı görür. */
export function usesSellerChannelPricing(customer: Pick<CustomerAccount, "sellerAccess">): boolean {
  return Boolean(customer.sellerAccess?.enabled) && customer.sellerAccess?.mode !== "referral";
}

export function priceProductForCustomer(product: CatalogProductRecord, customer: CustomerAccount): CustomerPrice | null {
  if (customer.status !== "approved") {
    return null;
  }

  const policy = resolveProductPricePolicy(product.sourceKey, product.brand);
  if (policy.action === "hidden") {
    return null;
  }

  const listPrice = parseMoney(product.listPrice);
  if (listPrice <= 0) {
    return null;
  }

  // Liste fiyatı marka kuralıyla önce standart bayinin KDV dahil net satış
  // fiyatına dönüşür. Satıcı/dropshipping kanalı düzenli toptan müşteriden ayrı
  // fiyatlanır ve bu netin üzerine sabit kanal farkı uygulanır.
  const standardDealerGross = roundMoney(listPrice * priceMultiplier(policy));
  const sellerChannel = usesSellerChannelPricing(customer);
  const gross = sellerChannel
    ? roundMoney(standardDealerGross * (1 + SELLER_CHANNEL_PREMIUM_RATE / 100))
    : standardDealerGross;
  const taxRate = Number(product.taxRate.replace(",", "."));
  return {
    visible: true,
    unitNetPrice: money(gross),
    displayPrice: formatMoney(gross, product.currency),
    ...(!sellerChannel && policy.action === "discount" ? { listPrice: formatMoney(listPrice, product.currency), discountRate: `${percent(policy.rate)}%` } : {}),
    ruleLabel: sellerChannel
      ? `Satıcı kanal fiyatı · standart bayi neti + %${SELLER_CHANNEL_PREMIUM_RATE}`
      : policy.ruleLabel,
    ...(sellerChannel ? { priceLabel: "Satıcı alış" } : policy.priceLabel ? { priceLabel: policy.priceLabel } : {}),
    taxIncluded: true,
    includedTaxAmount: money(includedVatAmount(gross, taxRate))
  };
}

export function priceUnavailableMessage(product: Pick<CatalogProductRecord, "brand" | "sourceKey">): string | undefined {
  const policy = resolveProductPricePolicy(product.sourceKey, product.brand);
  return policy.action === "hidden" ? `${policy.canonicalBrand} ürünlerinde fiyat bilgisi verilmiyor.` : undefined;
}

export function segmentLabel(segment: CustomerAccount["segment"]): string {
  if (segment === "industrial") {
    return "Sanayi";
  }

  if (segment === "project") {
    return "Proje";
  }

  return "Standart bayi";
}

export function parseMoney(value: string): number {
  const raw = value.trim().replace(/\s/g, "");
  const normalized = raw.includes(",") ? raw.replace(/\./g, "").replace(",", ".") : raw;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

export function money(value: number): string {
  return value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: false });
}

export function formatMoney(value: number, currency: string): string {
  const normalizedCurrency = currency === "TL" ? "TRY" : currency || "TRY";
  return new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency: normalizedCurrency,
    maximumFractionDigits: 2
  }).format(value);
}

function percent(value: number): string {
  return value.toLocaleString("tr-TR", { maximumFractionDigits: 2 });
}
