import { describe, expect, it } from "vitest";
import { applyCustomerStockPolicy, CUSTOMER_STOCK_LABEL } from "./customer-stock-policy";

describe("customer stock policy", () => {
  it.each(["in_stock", "low_stock", "incoming", "out_of_stock"] as const)("shows raw %s products as in stock", (stockTone) => {
    const result = applyCustomerStockPolicy({
      stockTone,
      stockLabel: "Kaynak durumu",
      stockQuantityKnown: false
    });

    expect(result).toEqual({
      stockTone: "in_stock",
      stockLabel: CUSTOMER_STOCK_LABEL,
      stockQuantityKnown: true
    });
  });
});
