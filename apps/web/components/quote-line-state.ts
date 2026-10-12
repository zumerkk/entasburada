import { quoteBasketItemKey, type QuoteBasketItem } from "./quote-basket";

export interface QuoteLineState {
  key: string;
  productSlug?: string | undefined;
  sku: string;
  name: string;
  quantity: string;
  unit: string;
  basketKey?: string | undefined;
}

export function mergeQuoteBasketLines(basket: QuoteBasketItem[], current: QuoteLineState[]): QuoteLineState[] {
  const merged: QuoteLineState[] = [];
  const seen = new Set<string>();
  for (const item of basket) {
    const basketKey = quoteBasketItemKey(item);
    if (seen.has(basketKey)) continue;
    merged.push({ key: `basket-${basketKey}`, productSlug: item.productSlug, sku: item.sku, name: item.name, quantity: String(item.quantity), unit: item.unit, basketKey });
    seen.add(basketKey);
  }
  for (const line of current) {
    if (!line.sku && !line.name) continue;
    const itemKey = quoteBasketItemKey(line);
    if (seen.has(itemKey)) continue;
    merged.push(line);
    seen.add(itemKey);
  }
  return merged;
}

export function editQuoteLine(line: QuoteLineState, patch: Partial<QuoteLineState>): QuoteLineState {
  const identityChanged = (patch.sku !== undefined && patch.sku !== line.sku) || (patch.name !== undefined && patch.name !== line.name);
  return { ...line, ...patch, ...(identityChanged ? { productSlug: undefined } : {}) };
}
