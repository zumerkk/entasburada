import type { CatalogProductRecord } from "@entas/catalog";
import type { CustomerAccount } from "./customer-auth";
import { includedVatAmount, priceMultiplier, resolveBrandPricePolicy, roundMoney } from "./commercial-policy";

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

export function priceProductForCustomer(product: CatalogProductRecord, customer: CustomerAccount): CustomerPrice | null {
  if (customer.status !== "approved") {
    return null;
  }

  const policy = resolveBrandPricePolicy(product.brand);
  if (policy.action === "hidden") {
    return null;
  }

  const listPrice = parseMoney(product.listPrice);
  if (listPrice <= 0) {
    return null;
  }

  // Liste fiyatı marka kuralıyla doğrudan KDV dahil satış fiyatına dönüşür.
  // Müşteri, segment, kategori ve ürüne özel fiyat alanları bilinçli olarak kullanılmaz.
  const gross = roundMoney(listPrice * priceMultiplier(policy));
  const taxRate = Number(product.taxRate.replace(",", "."));
  return {
    visible: true,
    unitNetPrice: money(gross),
    displayPrice: formatMoney(gross, product.currency),
    ...(policy.action === "discount" ? { listPrice: formatMoney(listPrice, product.currency), discountRate: `${percent(policy.rate)}%` } : {}),
    ruleLabel: policy.ruleLabel,
    ...(policy.priceLabel ? { priceLabel: policy.priceLabel } : {}),
    taxIncluded: true,
    includedTaxAmount: money(includedVatAmount(gross, taxRate))
  };
}

export function priceUnavailableMessage(product: Pick<CatalogProductRecord, "brand">): string | undefined {
  const policy = resolveBrandPricePolicy(product.brand);
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
