import { describe, expect, it } from "vitest";
import { MAX_CART_QUANTITY, normalizeCartQuantity, summarizeCartPricing } from "./cart-policy";

describe("cart policy", () => {
  it("enforces minimum and maximum order quantities", () => {
    expect(normalizeCartQuantity(1, 12)).toBe(12);
    expect(normalizeCartQuantity(18, 12)).toBe(18);
    expect(normalizeCartQuantity(MAX_CART_QUANTITY + 10, 1)).toBe(MAX_CART_QUANTITY);
    expect(normalizeCartQuantity(0, 12, true)).toBe(0);
  });

  it("keeps currency totals separate and blocks mixed-currency orders", () => {
    const policy = summarizeCartPricing([
      { currency: "TRY", lineTotal: "100.00", priceAvailable: true },
      { currency: "USD", lineTotal: "25.00", priceAvailable: true }
    ]);

    expect(policy.totals).toHaveLength(2);
    expect(policy.currencies).toEqual(["TRY", "USD"]);
    expect(policy.canCreateOrder).toBe(false);
    expect(policy.orderBlockReason).toContain("farklı para birimleri");
  });

  it("blocks direct orders when a line needs price confirmation", () => {
    const policy = summarizeCartPricing([
      { currency: "TRY", lineTotal: "0.00", priceAvailable: false },
      { currency: "TRY", lineTotal: "250.00", priceAvailable: true }
    ]);

    expect(policy.totals).toEqual([{ currency: "TRY", totalAmount: "250.00", displayTotal: "₺250,00" }]);
    expect(policy.unpricedItemCount).toBe(1);
    expect(policy.canCreateOrder).toBe(false);
  });

  it("applies free shipping at the KDV-included 10,000 TL threshold", () => {
    const below = summarizeCartPricing([{ currency: "TRY", lineTotal: "9999.99", includedTaxAmount: "1666.67", priceAvailable: true }]);
    const eligible = summarizeCartPricing([{ currency: "TRY", lineTotal: "10000.00", includedTaxAmount: "1666.67", priceAvailable: true }]);

    expect(below.qualifiesForFreeShipping).toBe(false);
    expect(below.amountUntilFreeShipping).toBe("0.01");
    expect(eligible.qualifiesForFreeShipping).toBe(true);
    expect(eligible.shippingMessage).toBe("Kargo bizden.");
    expect(eligible.includedTaxTotals[0]?.totalAmount).toBe("1666.67");
  });
});
