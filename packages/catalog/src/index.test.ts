import { describe, expect, it } from "vitest";
import {
  CATALOG_GROUPS,
  catalogGroupCount,
  createEmptyCatalogStore,
  mergeImportedProducts,
  publishProducts,
  resolveCatalogGroup,
  searchCatalogRecords,
  toAdminProduct,
  toPublicProduct,
  type ImportedSupplierProduct
} from "./index";

const imported: ImportedSupplierProduct = {
  sourceKey: "euromix-stock",
  sourceName: "EuroMix Stok XML",
  externalId: "RBT 007",
  sku: "RBT 007",
  barcode: "1234590936916",
  manufacturerCode: "DCWBT01",
  productName: "BORAL BLACK WHITE TEPE DUŞ SETİ",
  brandName: "EUROMIX",
  categoryPath: ["DUŞ TAKIMLARI", "ROBOT DUŞLAR"],
  categoryName: "ROBOT DUŞLAR",
  unitType: "ADET",
  taxRate: "20.00",
  currency: "USD",
  listPrice: "54.7500",
  stockQuantity: 11,
  stockStatus: "in_stock",
  imageUrl: "https://cdn.example.com/robot.png",
  priceVisibleToPublic: false
};

describe("@entas/catalog", () => {
  it("keeps imported products as draft until an admin publish action", () => {
    const store = mergeImportedProducts(createEmptyCatalogStore("2026-07-07T00:00:00.000Z"), [imported], "2026-07-07T01:00:00.000Z");

    expect(store.products[0]?.status).toBe("DRAFT");
    expect(store.products[0]?.isVisible).toBe(false);
    expect(searchCatalogRecords(store, { publicOnly: true }).total).toBe(0);
  });

  it("publishes selected products and writes an audit log", () => {
    const store = mergeImportedProducts(createEmptyCatalogStore(), [imported], "2026-07-07T01:00:00.000Z");
    const id = store.products[0]?.id;
    if (!id) {
      throw new Error("expected product id");
    }

    const result = publishProducts(store, [id], "admin@entasburada.com", "2026-07-07T02:00:00.000Z");

    expect(result.store.products[0]?.status).toBe("ACTIVE");
    expect(result.store.products[0]?.isVisible).toBe(true);
    expect(result.auditLogs).toHaveLength(1);
    expect(searchCatalogRecords(result.store, { publicOnly: true }).total).toBe(1);
  });

  it("removes price and exact stock from public products", () => {
    const store = mergeImportedProducts(createEmptyCatalogStore(), [imported], "2026-07-07T01:00:00.000Z");
    const product = store.products[0];
    if (!product) {
      throw new Error("expected product");
    }

    const publicProduct = toPublicProduct(product);

    expect("listPrice" in publicProduct).toBe(false);
    expect("stockQuantity" in publicProduct).toBe(false);
    expect(publicProduct.stockLabel).toBe("Stokta");
  });

  it("keeps exact price and stock available to admin DTOs", () => {
    const store = mergeImportedProducts(createEmptyCatalogStore(), [imported], "2026-07-07T01:00:00.000Z");
    const product = store.products[0];
    if (!product) {
      throw new Error("expected product");
    }

    const adminProduct = toAdminProduct(product);

    expect(adminProduct.listPrice).toBe("54.7500");
    expect(adminProduct.stockQuantity).toBe(11);
  });

  it("marks zero-price products as representative quote only", () => {
    const zeroPriceProduct: ImportedSupplierProduct = { ...imported, externalId: "ZERO-1", sku: "ZERO-1", listPrice: "0.0000" };
    const store = mergeImportedProducts(createEmptyCatalogStore(), [zeroPriceProduct], "2026-07-07T01:00:00.000Z");

    expect(store.products[0]?.priceApprovalStatus).toBe("NO_PRICE");
    expect(store.products[0]?.priceDisplayMode).toBe("CONTACT_REP");
  });

  it("resolves Turkish category aliases to catalog groups", () => {
    expect(resolveCatalogGroup("Pompa ve Su Sistemleri")?.slug).toBe("pompa-su-sistemleri");
    expect(resolveCatalogGroup("Hırdavat ve Bağlantı Elemanları")?.slug).toBe("tesisat-baglanti-elemanlari");
    expect(resolveCatalogGroup("elektrikli-el-aletleri")?.slug).toBe("elektrikli-el-aletleri");
  });

  it("lists parent catalog group products through mapped supplier categories", () => {
    const pumpProduct: ImportedSupplierProduct = {
      ...imported,
      externalId: "PUMP-1",
      sku: "PUMP-1",
      productName: "Dalgıç Pompa",
      categoryPath: ["Pompalar", "Dalgıç Pompalar"],
      categoryName: "Dalgıç Pompalar"
    };
    const store = publishProducts(mergeImportedProducts(createEmptyCatalogStore(), [pumpProduct], "2026-07-07T01:00:00.000Z"), ["supplier:euromix-stock:pump-1"], "admin").store;

    const result = searchCatalogRecords(store, { categoryGroup: "pompa-su-sistemleri", publicOnly: true });

    expect(result.total).toBe(1);
    expect(result.items[0]?.sku).toBe("PUMP-1");
  });

  it("falls back to related products instead of returning an empty category result", () => {
    const hardwareProduct: ImportedSupplierProduct = {
      ...imported,
      externalId: "HARDWARE-1",
      sku: "HARDWARE-1",
      productName: "Hırdavat Bağlantı Aparatı",
      categoryPath: ["HIRDAVAT"],
      categoryName: "HIRDAVAT"
    };
    const store = publishProducts(mergeImportedProducts(createEmptyCatalogStore(), [hardwareProduct], "2026-07-07T01:00:00.000Z"), ["supplier:euromix-stock:hardware-1"], "admin").store;

    const result = searchCatalogRecords(store, { category: "Elektrikli El Aletleri", publicOnly: true, allowCategoryFallback: true });

    expect(result.total).toBe(1);
    expect(result.fallback?.message).toBe("Bu kategoride doğrudan ürün bulunamadı, ilgili ürünleri gösteriyoruz.");
  });

  it("resets an invalid page offset to the first available result page", () => {
    const store = publishProducts(mergeImportedProducts(createEmptyCatalogStore(), [imported], "2026-07-07T01:00:00.000Z"), ["supplier:euromix-stock:rbt-007"], "admin").store;

    const result = searchCatalogRecords(store, { publicOnly: true, offset: 500, limit: 24 });

    expect(result.total).toBe(1);
    expect(result.offset).toBe(0);
  });

  it("keeps every built-in catalog group countable", () => {
    const store = publishProducts(mergeImportedProducts(createEmptyCatalogStore(), [imported], "2026-07-07T01:00:00.000Z"), ["supplier:euromix-stock:rbt-007"], "admin").store;
    const allGroup = CATALOG_GROUPS.find((group) => group.slug === "tum-urunler");
    if (!allGroup) {
      throw new Error("expected all group");
    }

    expect(catalogGroupCount(store, allGroup)).toBe(1);
  });
});
