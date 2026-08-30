import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { serializeSellerProductsCsv, serializeSellerProductsXml, type SellerCatalogProduct } from "./reseller-catalog";

const product: SellerCatalogProduct = {
  sku: "SKU-1",
  name: "Vana & Rekor <Set>",
  brand: "ENTAŞ",
  category: "Tesisat",
  categoryPath: ["Su Tesisatı", "Vana"],
  unit: "Adet",
  minOrder: 1,
  packageQuantity: 1,
  cartonQuantity: 10,
  currency: "TRY",
  purchasePrice: "120.00",
  displayPurchasePrice: "₺120,00",
  taxRate: 20,
  taxIncluded: true,
  recommendedSalePrice: "156.00",
  displayRecommendedSalePrice: "₺156,00",
  estimatedProfit: "36.00",
  stockStatus: "in_stock",
  stockLabel: "Stokta",
  stockRange: "11–25 adet",
  availableQuantity: 14,
  exactStock: true,
  orderable: true,
  imageUrl: "https://entasburada.com/image.webp",
  productUrl: "https://entasburada.com/products/sku-1",
  updatedAt: "2026-08-30T12:00:00.000Z"
};

describe("seller catalog feeds", () => {
  it("exports stable CSV columns and neutralizes spreadsheet formulas", () => {
    const csv = serializeSellerProductsCsv([{ ...product, sku: "=CMD()" }]);
    expect(csv).toContain("purchase_price_vat_included");
    expect(csv).toContain("'=CMD()");
    expect(csv).toContain("120.00");
  });

  it("escapes XML values and marks exact stock", () => {
    const xml = serializeSellerProductsXml([product], "2026-08-30T13:00:00.000Z");
    expect(xml).toContain("Vana &amp; Rekor &lt;Set&gt;");
    expect(xml).toContain('<stock status="in_stock" exact="true">14</stock>');
    expect(xml).toContain('productCount="1"');
  });
});
