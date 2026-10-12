import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { addToQuoteBasket, quoteBasketItemKey, readQuoteBasket, removeFromQuoteBasket, type QuoteBasketItem } from "./quote-basket";
import { editQuoteLine, mergeQuoteBasketLines, type QuoteLineState } from "./quote-line-state";

const storage = new Map<string, string>();
const bit: QuoteBasketItem = { productSlug: "sgs-509-matkap-ucu", sku: "509", name: "Matkap Ucu", unit: "Adet", quantity: 2 };
const compressor: QuoteBasketItem = { productSlug: "rtr-509-kompresor", sku: "509", name: "Kompresör", unit: "Adet", quantity: 1 };

function initialLine(item: QuoteBasketItem): QuoteLineState {
  return { key: "initial", productSlug: item.productSlug, sku: item.sku, name: item.name, quantity: String(item.quantity), unit: item.unit };
}

beforeEach(() => {
  storage.clear();
  vi.stubGlobal("window", {
    localStorage: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value)
    },
    dispatchEvent: vi.fn()
  });
  vi.stubGlobal("CustomEvent", class { constructor(public type: string, public options: unknown) {} });
});
afterEach(() => vi.unstubAllGlobals());

describe("quote basket product identity", () => {
  it("keeps products from different suppliers separate even when their SKUs are identical", () => {
    addToQuoteBasket(compressor);
    addToQuoteBasket(bit);

    expect(readQuoteBasket()).toEqual([compressor, bit]);
  });

  it("adds quantity only to the selected product's slug", () => {
    addToQuoteBasket(compressor);
    addToQuoteBasket(bit);
    addToQuoteBasket({ ...bit, quantity: 3 });

    expect(readQuoteBasket()).toEqual([compressor, { ...bit, quantity: 5 }]);
  });

  it("removes only the selected product when another row shares its SKU", () => {
    addToQuoteBasket(compressor);
    addToQuoteBasket(bit);

    expect(removeFromQuoteBasket(quoteBasketItemKey(bit))).toEqual([compressor]);
    expect(readQuoteBasket()).toEqual([compressor]);
  });

  it("keeps distinct slugs separate even when SKU and product name both match", () => {
    addToQuoteBasket(bit);
    const otherSupplier = { ...bit, productSlug: "other-supplier-matkap-ucu" };
    addToQuoteBasket(otherSupplier);

    expect(readQuoteBasket()).toEqual([bit, otherSupplier]);
  });

  it("reads legacy rows and distinguishes them by exact SKU and name together", () => {
    const legacyBit = { sku: bit.sku, name: bit.name, unit: bit.unit, quantity: bit.quantity };
    const legacyCompressor = { sku: compressor.sku, name: compressor.name, unit: compressor.unit, quantity: compressor.quantity };
    storage.set("entas-quote-basket", JSON.stringify([legacyCompressor]));
    addToQuoteBasket(legacyBit);
    addToQuoteBasket({ ...legacyBit, quantity: 1 });

    expect(readQuoteBasket()).toEqual([legacyCompressor, { ...legacyBit, quantity: 3 }]);
    expect(removeFromQuoteBasket(quoteBasketItemKey(legacyBit))).toEqual([legacyCompressor]);
  });

  it("does not treat a name substring as the same legacy product", () => {
    addToQuoteBasket({ ...bit, productSlug: undefined });
    addToQuoteBasket({ ...bit, productSlug: undefined, name: "Matkap Ucu Seti" });

    expect(readQuoteBasket()).toHaveLength(2);
  });
});

describe("quote form product identity", () => {
  it("keeps a selected URL product when a saved basket product has the same SKU", () => {
    const lines = mergeQuoteBasketLines([compressor], [initialLine(bit)]);

    expect(lines.map((line) => line.productSlug)).toEqual([compressor.productSlug, bit.productSlug]);
  });

  it("deduplicates the exact selected slug while retaining the basket quantity", () => {
    const lines = mergeQuoteBasketLines([bit], [{ ...initialLine(bit), quantity: "1" }]);

    expect(lines).toHaveLength(1);
    expect(lines[0]?.quantity).toBe("2");
    expect(lines[0]?.productSlug).toBe(bit.productSlug);
  });

  it("keeps legacy rows with a shared SKU and different exact names", () => {
    const legacyCompressor = { ...compressor, productSlug: undefined };
    const legacyBit = { ...bit, productSlug: undefined };

    expect(mergeQuoteBasketLines([legacyCompressor], [initialLine(legacyBit)]).map((line) => line.name)).toEqual([compressor.name, bit.name]);
  });

  it.each([{ sku: "999" }, { name: "Başka Ürün" }])("clears the selected catalog identity after editing code or name (%j)", (patch) => {
    const fromBasket = mergeQuoteBasketLines([bit], [])[0]!;
    const edited = editQuoteLine(fromBasket, patch);

    expect(edited.productSlug).toBeUndefined();
    expect(edited.basketKey).toBe(quoteBasketItemKey(bit));
  });

  it("retains catalog identity when changing quantity or unit", () => {
    const edited = editQuoteLine(initialLine(bit), { quantity: "5", unit: "Paket" });

    expect(edited.productSlug).toBe(bit.productSlug);
  });
});
