import { describe, expect, it } from "vitest";
import { calculateB2BPrice, type PriceRule } from "./index";

const baseContext = {
  dealerStatus: "approved" as const,
  customerId: "company-1",
  segmentId: "gold",
  productId: "prod-1",
  variantId: "var-1",
  brandId: "bosch-pro",
  categoryId: "power-tools",
  quantity: 12,
  taxRate: 20,
  displayTaxIncluded: true,
  now: new Date("2026-07-07T12:00:00.000Z")
};

describe("calculateB2BPrice", () => {
  it("hides all prices when the dealer is not approved", () => {
    const result = calculateB2BPrice({
      listNetPrice: "1000.00",
      rules: [],
      context: { ...baseContext, dealerStatus: "guest" }
    });

    expect(result.visible).toBe(false);
    if (!result.visible) {
      expect(result.cta).toBe("Bayi fiyatlarını görmek ve sipariş oluşturmak için giriş yapın.");
    }
  });

  it("applies customer manual price before campaigns and dealer prices", () => {
    const rules: PriceRule[] = [
      {
        id: "campaign",
        kind: "product_campaign_price",
        scope: "product",
        targetId: "prod-1",
        fixedNetPrice: "850",
        label: "Ürün kampanyası"
      },
      {
        id: "manual",
        kind: "customer_manual_price",
        scope: "customer",
        targetId: "company-1",
        fixedNetPrice: "720",
        label: "Müşteriye özel manuel fiyat"
      },
      {
        id: "dealer",
        kind: "standard_dealer_price",
        scope: "segment",
        targetId: "gold",
        discountRate: "10",
        label: "Gold bayi fiyatı"
      }
    ];

    const result = calculateB2BPrice({
      listNetPrice: "1000",
      rules,
      context: baseContext
    });

    expect(result.visible).toBe(true);
    if (result.visible) {
      expect(result.appliedRule.id).toBe("manual");
      expect(result.netPrice).toBe("720.00");
      expect(result.grossPrice).toBe("864.00");
    }
  });

  it("uses decimal arithmetic for tax and discount calculations", () => {
    const result = calculateB2BPrice({
      listNetPrice: "199.99",
      rules: [
        {
          id: "segment-discount",
          kind: "customer_group_price",
          scope: "segment",
          targetId: "gold",
          discountRate: "12.5",
          label: "Gold segment iskontosu"
        }
      ],
      context: baseContext
    });

    expect(result.visible).toBe(true);
    if (result.visible) {
      expect(result.netPrice).toBe("174.99");
      expect(result.grossPrice).toBe("209.99");
      expect(result.discountRate).toBe("12.50");
    }
  });
});
