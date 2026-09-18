import { describe, expect, it } from "vitest";
import type { CatalogProductRecord } from "@entas/catalog";
import type { CustomerAccount } from "./customer-auth";
import { priceProductForCustomer, priceUnavailableMessage, usesSellerChannelPricing } from "./customer-pricing";

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
  it.each(["ARC BANYO", "Marka Bekliyor"])("prices ARC PDF rows with brand %s using discount, markup and VAT once", (brand) => {
    const arc = { ...product, sourceKey: "catalog-pdfler-fiyat-listesi-subat-2025", brand, taxRate: "10", listPrice: "42690.00" };
    expect(priceProductForCustomer(arc, customer)).toMatchObject({
      unitNetPrice: "29349.38",
      includedTaxAmount: "2668.13",
      discountRate: "31,25%",
      taxIncluded: true
    });
  });

  it.each([
    ["ARC BANYO", "137.50", "31,25%"],
    ["ARC BOYA", "168.00", "16%"],
    ["Doğal Plastik", "162.00", "19%"],
    ["EUROMIX", "200.00", undefined],
    ["FORZA", "162.00", "19%"],
    ["IBELTECH", "178.00", "11%"],
    ["KAREN", "140.00", "30%"],
    ["KF KUZEY FITTINGS", "140.00", "30%"],
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

  it("uses the precomputed Euromix portal sale price without applying a second discount", () => {
    const price = priceProductForCustomer({ ...product, sku: "BH 012", listPrice: "486.06" }, customer);

    expect(price?.unitNetPrice).toBe("486.06");
    expect(price?.displayPrice).toBe("₺486,06");
    expect(price?.includedTaxAmount).toBe("81.01");
    expect(price?.ruleLabel).toBe("Euromix bayi neti - %15 alış iskontosu + %20 KDV + %30 kâr");
    expect(price?.priceLabel).toBe("Net");
    expect(price?.listPrice).toBeUndefined();
  });

  it("discounts KF Kuzey Fittings catalog prices by 30%", () => {
    const price = priceProductForCustomer(withBrand("KF KUZEY FITTINGS"), customer);

    expect(price).toMatchObject({
      unitNetPrice: "140.00",
      listPrice: "₺200,00",
      discountRate: "30%",
      ruleLabel: "KF Kuzey Fittings liste fiyatı - %30"
    });
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

  it("prices seller and dropshipping accounts 20% above the standard dealer net", () => {
    const seller: CustomerAccount = {
      ...customer,
      sellerAccess: {
        enabled: true,
        mode: "hybrid",
        productFeedEnabled: true,
        apiEnabled: true,
        exactStockEnabled: true,
        orderApiEnabled: true,
        blindShippingEnabled: true,
        defaultMarkupRate: 30
      }
    };

    const standardPrice = priceProductForCustomer(withBrand("SAYIM"), customer);
    const sellerPrice = priceProductForCustomer(withBrand("SAYIM"), seller);

    expect(standardPrice?.unitNetPrice).toBe("130.00");
    expect(sellerPrice).toMatchObject({
      unitNetPrice: "156.00",
      displayPrice: "₺156,00",
      includedTaxAmount: "26.00",
      priceLabel: "Satıcı alış",
      ruleLabel: "Satıcı kanal fiyatı · standart bayi neti + %20"
    });
    expect(sellerPrice?.listPrice).toBeUndefined();
    expect(sellerPrice?.discountRate).toBeUndefined();
  });

  it("prices a referral-only marketer exactly like the customers they bring", () => {
    const marketer: CustomerAccount = {
      ...customer,
      sellerAccess: {
        enabled: true,
        mode: "referral",
        productFeedEnabled: false,
        apiEnabled: false,
        exactStockEnabled: false,
        orderApiEnabled: false,
        blindShippingEnabled: false,
        defaultMarkupRate: 30
      }
    };

    expect(usesSellerChannelPricing(marketer)).toBe(false);
    expect(priceProductForCustomer(withBrand("SAYIM"), marketer)).toEqual(priceProductForCustomer(withBrand("SAYIM"), customer));
    expect(priceProductForCustomer(withBrand("EUROMIX"), marketer)).toMatchObject({ unitNetPrice: "200.00", priceLabel: "Net" });
  });

  it("uses the list price as Net for MRS Max/Mırsan and unspecified brands", () => {
    expect(priceProductForCustomer(withBrand("MRSMAX"), customer)).toMatchObject({ unitNetPrice: "200.00", priceLabel: "Net", ruleLabel: "Net" });
    expect(priceProductForCustomer(withBrand("ENTAŞ"), customer)).toMatchObject({ unitNetPrice: "200.00", priceLabel: "Net" });
  });

  it("keeps prices closed for non-approved accounts", () => {
    expect(priceProductForCustomer(product, { ...customer, status: "suspended" })).toBeNull();
  });

  // Regresyon kilidi: KAREN LED ayna listesi tedarikci ALIS fiyatidir. Karen
  // markasinin -%30 kurali buraya sizarsa bayi alisin altini gorur (zarar).
  // Kaynak anahtari degisirse bu test kirilir; commercial-policy.ts guncellenmeli.
  it("prices Karen LED mirrors as net and never applies the Karen -30% brand rule", () => {
    const mirror = {
      ...product,
      sourceKey: "catalog-pdf-karen-led-ayna-2026",
      brand: "KAREN",
      sku: "KRN-AYN-SILVA-60X80XCM",
      listPrice: "2800.00"
    };
    const price = priceProductForCustomer(mirror, customer);

    expect(price).toMatchObject({
      unitNetPrice: "2800.00",
      priceLabel: "Net",
      ruleLabel: "Karen LED ayna net fiyati"
    });
    expect(price?.discountRate).toBeUndefined();
    expect(price?.listPrice).toBeUndefined();
  });

  it("still discounts Karen bathroom furniture by 30% from its own source", () => {
    const cabinet = {
      ...product,
      sourceKey: "catalog-pdf-karen-banyo-2026-1-revize",
      brand: "KAREN",
      sku: "KRN-BNY-LIANA-80"
    };

    expect(priceProductForCustomer(cabinet, customer)).toMatchObject({
      unitNetPrice: "140.00",
      discountRate: "30%",
      ruleLabel: "Karen liste fiyatı - %30"
    });
  });
});
