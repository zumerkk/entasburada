"use client";

// Teklif sepeti: giriş gerektirmeden, gezinirken ürün biriktirme.
// localStorage'da yaşar; her değişiklikte pencereye olay yayılır (rozet güncellemesi).

export interface QuoteBasketItem {
  sku: string;
  name: string;
  unit: string;
  quantity: number;
}

const STORAGE_KEY = "entas-quote-basket";
export const QUOTE_BASKET_EVENT = "entas-quote-basket-changed";

export function readQuoteBasket(): QuoteBasketItem[] {
  if (typeof window === "undefined") {
    return [];
  }
  try {
    const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "[]");
    return Array.isArray(parsed)
      ? parsed
          .filter((item) => item && typeof item.sku === "string")
          .map((item) => ({
            sku: String(item.sku),
            name: String(item.name ?? ""),
            unit: String(item.unit ?? "Adet"),
            quantity: Math.max(1, Number(item.quantity) || 1)
          }))
      : [];
  } catch {
    return [];
  }
}

function writeQuoteBasket(items: QuoteBasketItem[]): void {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  window.dispatchEvent(new CustomEvent(QUOTE_BASKET_EVENT, { detail: { count: items.length } }));
}

export function addToQuoteBasket(item: Omit<QuoteBasketItem, "quantity"> & { quantity?: number }): QuoteBasketItem[] {
  const items = readQuoteBasket();
  const existing = items.find((entry) => entry.sku === item.sku);
  if (existing) {
    existing.quantity += Math.max(1, item.quantity ?? 1);
  } else {
    items.push({ sku: item.sku, name: item.name, unit: item.unit || "Adet", quantity: Math.max(1, item.quantity ?? 1) });
  }
  writeQuoteBasket(items);
  return items;
}

export function removeFromQuoteBasket(sku: string): QuoteBasketItem[] {
  const items = readQuoteBasket().filter((entry) => entry.sku !== sku);
  writeQuoteBasket(items);
  return items;
}

export function clearQuoteBasket(): void {
  writeQuoteBasket([]);
}

export function quoteBasketCount(): number {
  return readQuoteBasket().length;
}
