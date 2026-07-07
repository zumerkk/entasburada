import type { CatalogProductRecord } from "@entas/catalog";
import type { CustomerAccount } from "./customer-auth";

export interface CustomerPrice {
  visible: true;
  unitNetPrice: string;
  displayPrice: string;
  listPrice: string;
  discountRate: string;
  ruleLabel: string;
}

export function priceProductForCustomer(product: CatalogProductRecord, customer: CustomerAccount): CustomerPrice | null {
  if (customer.status !== "approved") {
    return null;
  }

  const specialPrice = findSpecialPrice(product, customer);
  const listPrice = parseMoney(product.listPrice);
  if (specialPrice != null) {
    const discount = listPrice === 0 ? 0 : Math.max(0, (1 - specialPrice / listPrice) * 100);
    return {
      visible: true,
      unitNetPrice: money(specialPrice),
      displayPrice: formatMoney(specialPrice, product.currency),
      listPrice: formatMoney(listPrice, product.currency),
      discountRate: `${percent(discount)}%`,
      ruleLabel: "Ozel net fiyat"
    };
  }

  if (listPrice <= 0) {
    return null;
  }

  const rule = bestDiscountRule(product, customer);
  const net = listPrice * (1 - rule.discountRate / 100);
  return {
    visible: true,
    unitNetPrice: money(net),
    displayPrice: formatMoney(net, product.currency),
    listPrice: formatMoney(listPrice, product.currency),
    discountRate: `${percent(rule.discountRate)}%`,
    ruleLabel: rule.label
  };
}

function findSpecialPrice(product: CatalogProductRecord, customer: CustomerAccount): number | null {
  const candidates = [product.sku, product.barcode ?? "", product.manufacturerCode ?? ""].filter(Boolean);
  for (const candidate of candidates) {
    const value = customer.specialNetPrices[candidate];
    if (value) {
      return parseMoney(value);
    }
  }

  const productText = normalize([product.sku, product.name, product.barcode ?? "", product.manufacturerCode ?? ""].join(" "));
  for (const [key, value] of Object.entries(customer.specialNetPrices)) {
    if (productText.includes(normalize(key))) {
      return parseMoney(value);
    }
  }

  return null;
}

function bestDiscountRule(product: CatalogProductRecord, customer: CustomerAccount): { discountRate: number; label: string } {
  const rules = [{ discountRate: customer.baseDiscountRate, label: `${segmentLabel(customer.segment)} baz iskontosu` }];

  for (const [brand, discountRate] of Object.entries(customer.brandDiscounts)) {
    if (normalize(product.brand) === normalize(brand)) {
      rules.push({ discountRate, label: `${brand} marka iskontosu` });
    }
  }

  const categoryText = normalize([product.category, ...product.categoryPath].join(" "));
  for (const [category, discountRate] of Object.entries(customer.categoryDiscounts)) {
    if (categoryText.includes(normalize(category))) {
      rules.push({ discountRate, label: `${category} kategori iskontosu` });
    }
  }

  return rules.sort((a, b) => b.discountRate - a.discountRate)[0]!;
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
  return Number.isFinite(parsed) ? parsed : 0;
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

function normalize(value: string): string {
  return value
    .trim()
    .toLocaleLowerCase("tr-TR")
    .replace(/[ç]/g, "c")
    .replace(/[ğ]/g, "g")
    .replace(/[ı]/g, "i")
    .replace(/[ö]/g, "o")
    .replace(/[ş]/g, "s")
    .replace(/[ü]/g, "u");
}
