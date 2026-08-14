import { describe, expect, it } from "vitest";
import type { CatalogProductRecord } from "@entas/catalog";
import type { CustomerAccount } from "./customer-auth";
import { priceProductForCustomer, priceUnavailableMessage } from "./customer-pricing";

const product: CatalogProductRecord = {
  id: "product-1",
  sourceKey: "test",
  sourceName: "Test",
  externalId: "1",
  sku: "JL4304A",
  slug: "test-product",
  name: "Test Ürün",
  brand: "EUROMIX",
  categoryPath: ["Test"],
  category: "Test",
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
  city: "İstanbul",
  deliveryAddress: "Test",
  status: "approved",
  segment: "project",
  baseDiscountRate: 49,
  brandDiscounts: { EUROMIX: 48 },
  categoryDiscounts: { Test: 47 },
  specialNetPrices: { JL4304A: "1.00" }
};

function withBrand(brand: string): CatalogProductRecord {
  return { ...product, brand };
}

describe("common brand pricing", () => {
  it.each([
    ["ARC BANYO", "168.00", "16%"],
    ["Doğal Plastik", "162.00", "19%"],
    ["EUROMIX", "156.00", "22%"],
    ["FORZA", "162.00", "19%"],
    ["IBELTECH", "178.00", "11%"],
    ["KAREN", "140.00", "30%"],
    ["MESEM", "156.00", "22%"],
    ["MRSMAX", "200.00", undefined],
    ["MIRSAN", "200.00", undefined],
    ["ONAY", "182.00", "9%"],
    ["PİMTAŞ", "178.00", "11%"],
    ["SAYIM", "130.00", "35%"],
    ["SGS PLUS", "162.00", "19%"],
    ["TRICRAFT", "156.00", "22%"]
  ])("applies the configured %s rule", (brand, expectedPrice, expectedDiscount) => {
    const price = priceProductForCustomer(withBrand(brand), customer);

    expect(price?.unitNetPrice).toBe(expectedPrice);
    expect(price?.discountRate).toBe(expectedDiscount);
    expect(price?.taxIncluded).toBe(true);
  });

  it("discounts the Euromix XML list by 22% and separates the included VAT without adding it again", () => {
    const price = priceProductForCustomer(product, customer);

    expect(price?.unitNetPrice).toBe("156.00");
    expect(price?.includedTaxAmount).toBe("26.00");
    expect(price?.ruleLabel).toBe("Euromix XML liste fiyatı - %22");
    expect(price?.listPrice).toBe("₺200,00");
  });

  it("locks EURO 089 to the XML list and a 22% discounted dealer price", () => {
    const price = priceProductForCustomer({ ...product, sku: "EURO 089", listPrice: "1690.00" }, customer);

    expect(price?.unitNetPrice).toBe("1318.20");
    expect(price?.displayPrice).toBe("₺1.318,20");
    expect(price?.ruleLabel).toBe("Euromix XML liste fiyatı - %22");
  });

  it("does not disclose Floran/Floorpan and Jamindar/Lamindoor prices", () => {
    for (const brand of ["FLORAN", "FLOORPAN", "JAMINDAR", "LAMINDOOR"]) {
      const hiddenProduct = withBrand(brand);
      expect(priceProductForCustomer(hiddenProduct, customer)).toBeNull();
      expect(priceUnavailableMessage(hiddenProduct)).toContain("fiyat bilgisi verilmiyor");
    }
  });

  it("returns the same price for every approved customer and ignores legacy customer overrides", () => {
    const otherCustomer: CustomerAccount = {
      ...customer,
      id: "customer-2",
      segment: "standard",
      baseDiscountRate: 0,
      brandDiscounts: {},
      categoryDiscounts: {},
      specialNetPrices: {}
    };

    expect(priceProductForCustomer(product, customer)).toEqual(priceProductForCustomer(product, otherCustomer));
  });

  it("uses the list price as Net for MRS Max/Mırsan and unspecified brands", () => {
    expect(priceProductForCustomer(withBrand("MRSMAX"), customer)).toMatchObject({ unitNetPrice: "200.00", priceLabel: "Net", ruleLabel: "Net" });
    expect(priceProductForCustomer(withBrand("ENTAŞ"), customer)).toMatchObject({ unitNetPrice: "200.00", priceLabel: "Net" });
  });

  it("keeps prices closed for non-approved accounts", () => {
    expect(priceProductForCustomer(product, { ...customer, status: "suspended" })).toBeNull();
  });
});
