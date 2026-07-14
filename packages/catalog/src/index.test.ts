import { describe, expect, it } from "vitest";
import {
  CATALOG_GROUPS,
  CATALOG_TREE,
  catalogTextMatchesPhrase,
  catalogGroupCount,
  classifyCatalogProduct,
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

  it("keeps PDF catalog index cards hidden during bulk publishing", () => {
    const indexCard: ImportedSupplierProduct = {
      ...imported,
      sourceKey: "catalog-pdfler-sgs-fiyat-listesi-ocak-2026",
      sourceName: "SGS Fiyat Listesi Ocak 2026",
      externalId: "SGS-KATALOG-INDEX-001",
      sku: "SGS-KATALOG-INDEX-001",
      productName: "SGS PDF Katalog İndeksi",
      categoryPath: ["PDF Katalog"],
      categoryName: "PDF Katalog"
    };
    const merged = mergeImportedProducts(createEmptyCatalogStore(), [indexCard], "2026-07-07T01:00:00.000Z");
    const productId = merged.products[0]?.id;
    if (!productId) {
      throw new Error("expected catalog index id");
    }

    const published = publishProducts(merged, [productId], "admin").store;

    expect(published.products[0]?.status).toBe("PASSIVE");
    expect(published.products[0]?.isVisible).toBe(false);
    expect(searchCatalogRecords(published, { publicOnly: true }).total).toBe(0);
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

  it("keeps an empty category empty instead of leaking unrelated fallback products", () => {
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

    expect(result.total).toBe(0);
    expect(result.fallback).toBeUndefined();
  });

  it("matches category phrases at word boundaries", () => {
    expect(catalogTextMatchesPhrase("Endüstriyel basınçlı yıkama makinesi", "duş")).toBe(false);
    expect(catalogTextMatchesPhrase("Basınç düşürücü adaptör", "duş")).toBe(false);
    expect(catalogTextMatchesPhrase("Chrome vanadium anahtar", "vana")).toBe(false);
    expect(catalogTextMatchesPhrase("Robot duş seti", "duş")).toBe(true);
    expect(catalogTextMatchesPhrase("Duşakabin paneli", "duş")).toBe(false);
    expect(catalogTextMatchesPhrase("Duşakabin paneli", "duşakabin")).toBe(true);
  });

  it("assigns screenshot regressions to one correct canonical category", () => {
    const pressureWasher = classifyCatalogProduct({
      sourceKey: "catalog-pdfler-sgs-fiyat-listesi-ocak-2026",
      name: "Basınçlı Yıkama Makinesi / Endüstriyel 2200 Watt",
      category: "El aletleri ve iş güvenliği",
      categoryPath: ["El aletleri ve iş güvenliği"]
    });
    const hoe = classifyCatalogProduct({
      sourceKey: "catalog-pdfler-entas-bk-2026-fiyat-listesi",
      name: "BÜYÜK ÖZEL ÇATALLI ÇAPA",
      category: "Banyo ve mutfak",
      categoryPath: ["Banyo ve mutfak"]
    });
    const bathProduct = classifyCatalogProduct({
      sourceKey: "euromix-stock",
      name: "Robot Duş Takımı",
      category: "ROBOT DUŞLAR",
      categoryPath: ["DUŞ TAKIMLARI", "ROBOT DUŞLAR"]
    });

    expect(pressureWasher.groupSlug).toBe("temizlik-ekipmanlari");
    expect(pressureWasher.categorySlug).toBe("basincli-yikama");
    expect(hoe.groupSlug).toBe("sulama-bahce");
    expect(hoe.categorySlug).toBe("bahce-el-aletleri");
    expect(bathProduct.groupSlug).toBe("banyo-vitrifiye");
  });

  it("distinguishes power-tool batteries from faucet batteries", () => {
    const powerBattery = classifyCatalogProduct({
      sourceKey: "catalog-pdfler-sgs-fiyat-listesi-ocak-2026",
      name: "SGS 20V MAX Li-ion Batarya 4.0Ah",
      category: "El aletleri ve iş güvenliği"
    });
    const faucet = classifyCatalogProduct({
      sourceKey: "euromix-stock",
      name: "Siyah Banyo Bataryası",
      category: "BATARYALAR"
    });

    expect(powerBattery.groupSlug).toBe("elektrikli-aletler");
    expect(faucet.groupSlug).toBe("musluk-batarya");
  });

  it("does not classify variable-speed grinders as pumps", () => {
    const grinder = classifyCatalogProduct({
      sourceKey: "catalog-pdfler-sgs-fiyat-listesi-ocak-2026",
      name: "Avuç Taşlama Makinesi (Kademeli Hız)",
      category: "El aletleri ve iş güvenliği"
    });

    expect(grinder.groupSlug).toBe("elektrikli-aletler");
  });

  it("handles domain-specific compound terms before generic words", () => {
    const pressureReducer = classifyCatalogProduct({
      sourceKey: "euromix-stock",
      name: "Basınç Düşürücü Adaptör",
      category: "BASINÇ (REGÜLETÖR) MALZEMELERİ"
    });
    const irrigationCollar = classifyCatalogProduct({
      sourceKey: "catalog-pdfler-entas-sulama-2026-katalog",
      name: "Metal Priz Kolye 140x1",
      category: "KAPLİN GRUBU"
    });
    const abrasive = classifyCatalogProduct({
      sourceKey: "catalog-pdfler-sgs-fiyat-listesi-ocak-2026",
      name: "Saplı Mop Zımpara 80 Kum",
      category: "El aletleri ve iş güvenliği"
    });
    const showerHose = classifyCatalogProduct({
      sourceKey: "euromix-stock",
      name: "Endüstriyel Batarya Hortumu",
      category: "DUŞ HORTUMLARI"
    });
    const gardenPump = classifyCatalogProduct({
      sourceKey: "catalog-pdfler-sgs-fiyat-listesi-ocak-2026",
      name: "Bahçe Pompası 1200 Watt",
      category: "El aletleri ve iş güvenliği"
    });
    const showerSealant = classifyCatalogProduct({
      sourceKey: "euromix-stock",
      name: "Duşakabin Silikon",
      category: "SİLİKONLAR"
    });

    expect(pressureReducer.groupSlug).toBe("su-tesisati");
    expect(irrigationCollar.groupSlug).toBe("su-tesisati");
    expect(abrasive.groupSlug).toBe("el-aletleri");
    expect(showerHose.groupSlug).toBe("hortum-flex");
    expect(gardenPump.groupSlug).toBe("pompa-hidrofor");
    expect(showerSealant.groupSlug).toBe("boya-kimyasal");
    expect(showerSealant.categorySlug).toBe("silikon-mastik");
  });

  it("keeps canonical parent groups mutually exclusive", () => {
    const products: ImportedSupplierProduct[] = [
      {
        ...imported,
        sourceKey: "catalog-pdfler-sgs-fiyat-listesi-ocak-2026",
        externalId: "SGS5403",
        sku: "SGS5403",
        productName: "Basınçlı Yıkama Makinesi / Endüstriyel 2200 Watt",
        categoryPath: ["El aletleri ve iş güvenliği"],
        categoryName: "El aletleri ve iş güvenliği"
      },
      {
        ...imported,
        sourceKey: "catalog-pdfler-entas-bk-2026-fiyat-listesi",
        externalId: "313",
        sku: "313",
        productName: "BÜYÜK ÖZEL ÇATALLI ÇAPA",
        categoryPath: ["Banyo ve mutfak"],
        categoryName: "Banyo ve mutfak"
      },
      imported,
      {
        ...imported,
        externalId: "F-310D",
        sku: "F-310D",
        productName: "Duşakabin Silikon",
        categoryPath: ["SİLİKONLAR"],
        categoryName: "SİLİKONLAR"
      }
    ];
    const merged = mergeImportedProducts(createEmptyCatalogStore(), products, "2026-07-07T01:00:00.000Z");
    const store = publishProducts(merged, merged.products.map((product) => product.id), "admin").store;
    const parentTotal = CATALOG_TREE.reduce((total, category) => {
      const group = resolveCatalogGroup(category.slug);
      if (!group) {
        throw new Error(`expected catalog group: ${category.slug}`);
      }
      return total + catalogGroupCount(store, group);
    }, 0);

    expect(parentTotal).toBe(products.length);
    expect(searchCatalogRecords(store, { categoryGroup: "banyo-vitrifiye", publicOnly: true }).total).toBe(1);
    expect(searchCatalogRecords(store, { categoryGroup: "temizlik-ekipmanlari", publicOnly: true }).total).toBe(1);
    expect(searchCatalogRecords(store, { categoryGroup: "sulama-bahce", publicOnly: true }).total).toBe(1);
    expect(searchCatalogRecords(store, { categoryGroup: "boya-kimyasal", publicOnly: true }).total).toBe(1);
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
