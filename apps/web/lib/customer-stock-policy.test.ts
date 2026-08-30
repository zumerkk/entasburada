import { describe, expect, it } from "vitest";
import { applyCustomerStockPolicy } from "./customer-stock-policy";

describe("customer stock policy", () => {
  it.each(["in_stock", "low_stock", "incoming", "out_of_stock"] as const)("preserves the real %s stock status", (stockTone) => {
    const result = applyCustomerStockPolicy({
      stockTone,
      stockLabel: "Kaynak durumu",
      stockQuantityKnown: false
    });

    expect(result).toEqual({
      stockTone,
      stockLabel: "Kaynak durumu",
      stockQuantityKnown: false
    });
  });
});
