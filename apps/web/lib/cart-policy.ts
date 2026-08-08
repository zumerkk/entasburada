import { formatMoney, money, parseMoney } from "./customer-pricing";
import { FREE_SHIPPING_THRESHOLD_TRY } from "./commercial-policy";

export const MAX_CART_LINES = 500;
export const MAX_CART_QUANTITY = 999_999;

export interface CartCurrencyTotal {
  currency: string;
  totalAmount: string;
  displayTotal: string;
}

export interface CartPricingPolicy {
  totals: CartCurrencyTotal[];
  includedTaxTotals: CartCurrencyTotal[];
  currencies: string[];
  unpricedItemCount: number;
  canCreateOrder: boolean;
  orderBlockReason?: string;
  freeShippingThreshold: string;
  displayFreeShippingThreshold: string;
  qualifiesForFreeShipping: boolean;
  amountUntilFreeShipping: string;
  shippingMessage: string;
}

export function normalizeCartQuantity(value: unknown, minOrder = 1, allowZero = false): number {
  const parsed = Number(value);
  if (allowZero && Number.isFinite(parsed) && parsed <= 0) return 0;
  const minimum = Math.max(1, Math.trunc(Number(minOrder) || 1));
  const quantity = Number.isFinite(parsed) ? Math.trunc(parsed) : minimum;
  return Math.min(MAX_CART_QUANTITY, Math.max(minimum, quantity));
}

export function summarizeCartPricing(
  lines: Array<{ currency: string; lineTotal: string; includedTaxAmount?: string; priceAvailable: boolean }>
): CartPricingPolicy {
  const amountByCurrency = new Map<string, number>();
  const taxByCurrency = new Map<string, number>();
  for (const line of lines) {
    const currency = normalizeCurrency(line.currency);
    amountByCurrency.set(currency, (amountByCurrency.get(currency) ?? 0) + parseMoney(line.lineTotal));
    taxByCurrency.set(currency, (taxByCurrency.get(currency) ?? 0) + parseMoney(line.includedTaxAmount ?? "0"));
  }

  const totals = [...amountByCurrency.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([currency, amount]) => ({ currency, totalAmount: money(amount), displayTotal: formatMoney(amount, currency) }));
  const includedTaxTotals = [...taxByCurrency.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([currency, amount]) => ({ currency, totalAmount: money(amount), displayTotal: formatMoney(amount, currency) }));
  const unpricedItemCount = lines.filter((line) => !line.priceAvailable).length;
  const reasons: string[] = [];
  if (unpricedItemCount > 0) {
    reasons.push(`${unpricedItemCount} ürün için net fiyat teyidi gerekiyor`);
  }
  if (totals.length > 1) {
    reasons.push("farklı para birimleri ayrı sipariş edilmelidir");
  }

  const tryTotal = totals.length === 1 && totals[0]?.currency === "TRY" ? parseMoney(totals[0].totalAmount) : 0;
  const qualifiesForFreeShipping = tryTotal >= FREE_SHIPPING_THRESHOLD_TRY;
  const amountUntilFreeShipping = Math.max(0, FREE_SHIPPING_THRESHOLD_TRY - tryTotal);
  const shippingMessage = qualifiesForFreeShipping
    ? "Kargo bizden."
    : tryTotal > 0
      ? `Ücretsiz kargo için ${formatMoney(amountUntilFreeShipping, "TRY")} daha ekleyin.`
      : `Kargo, ${formatMoney(FREE_SHIPPING_THRESHOLD_TRY, "TRY")} ve üzeri siparişlerde bizden.`;

  return {
    totals,
    includedTaxTotals,
    currencies: totals.map((total) => total.currency),
    unpricedItemCount,
    canCreateOrder: lines.length > 0 && reasons.length === 0,
    freeShippingThreshold: money(FREE_SHIPPING_THRESHOLD_TRY),
    displayFreeShippingThreshold: formatMoney(FREE_SHIPPING_THRESHOLD_TRY, "TRY"),
    qualifiesForFreeShipping,
    amountUntilFreeShipping: money(amountUntilFreeShipping),
    shippingMessage,
    ...(reasons.length ? { orderBlockReason: `${reasons.join("; ")}.` } : {})
  };
}

function normalizeCurrency(value: string): string {
  const currency = value.trim().toUpperCase();
  return currency === "TL" || !currency ? "TRY" : currency;
}
