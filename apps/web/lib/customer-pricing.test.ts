import { describe, expect, it } from "vitest";
import type { CatalogProductRecord } from "@entas/catalog";
import type { CustomerAccount } from "./customer-auth";
import { priceProductForCustomer } from "./customer-pricing";

const product: CatalogProductRecord = {
  id: "product-1",
  sourceKey: "test",
  sourceName: "Test",
  externalId: "1",
  sku: "JL4304A",
  slug: "test-product",
  name: "Test Matkap",
  brand: "EUROMIX",
  categoryPath: ["Elektrikli El Aletleri"],
  category: "Elektrikli El Aletleri",
  unitType: "Adet",
  taxRate: "20",
  currency: "TRY",
  listPrice: "200.00",
  stockQuantity: 12,
  stockStatus: "in_stock",
  status: "ACTIVE",
  isVisible: true,
  priceApprovalStatus: "APPROVED",
  priceDisplayMode: "HIDDEN_UNTIL_DEALER",
  importedAt: "2026-07-07T00:00:00.000Z",
  createdAt: "2026-07-07T00:00:00.000Z",
  updatedAt: "2026-07-07T00:00:00.000Z"
};

const customer: CustomerAccount = {
  id: "customer-1",
  email: "test@example.com",
  password: "secret",
  companyName: "Test",
  authorizedPerson: "Test",
  phone: "05550000000",
  city: "Istanbul",
  deliveryAddress: "Test",
  status: "approved",
  segment: "project",
  baseDiscountRate: 12,
  brandDiscounts: { EUROMIX: 18 },
  categoryDiscounts: { Elektrikli: 26 },
  specialNetPrices: {}
};

describe("customer pricing", () => {
  it("applies the strongest matching discount", () => {
    const price = priceProductForCustomer(product, customer);

    expect(price?.unitNetPrice).toBe("148.00");
    expect(price?.discountRate).toBe("26%");
    expect(price?.ruleLabel).toBe("Elektrikli kategori iskontosu");
  });

  it("uses special net price before discount rules", () => {
    const price = priceProductForCustomer(product, {
      ...customer,
      specialNetPrices: { JL4304A: "95.00" }
    });

    expect(price?.unitNetPrice).toBe("95.00");
    expect(price?.ruleLabel).toBe("Ozel net fiyat");
  });
});
