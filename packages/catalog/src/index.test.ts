import { describe, expect, it } from "vitest";
import {
  applyPriceOperation,
  CATALOG_GROUPS,
  CATALOG_TREE,
  catalogTextMatchesPhrase,
  catalogGroupCount,
  classifyCatalogProduct,
  createEmptyCatalogStore,
  deleteProducts,
  mergeImportedProducts,
  publishProducts,
  setProductsStatus,
  resolveCatalogGroup,
  searchCatalogRecords,
  toAdminProduct,
  toPublicProduct,
  type CatalogStore,
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

  it("repairs product id collisions caused by equivalent slug values", () => {
    const first = { ...imported, externalId: "ABC+123", sku: "FIRST-123" };
    const second = { ...imported, externalId: "ABC 123", sku: "SECOND-123", productName: "Başka ürün" };
    const store = mergeImportedProducts(createEmptyCatalogStore(), [first, second]);
    expect(new Set(store.products.map((product) => product.id)).size).toBe(2);
    expect(store.products.every((product) => /-[a-f0-9]{16}$/.test(product.id))).toBe(true);
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

  it("pins every Modamix catalog product to Robot Duşlar", () => {
    const modamixProduct = classifyCatalogProduct({
      sourceKey: "catalog-modamix-2026-04-02",
      name: "70 CM Krom Duş Spirali",
      category: "Robot Duşlar",
      categoryPath: ["Banyo & Vitrifiye", "Duş Sistemleri", "Robot Duşlar"]
    });

    expect(modamixProduct.groupSlug).toBe("banyo-vitrifiye");
    expect(modamixProduct.categorySlug).toBe("robot-dus");
    expect(modamixProduct.categoryLabel).toBe("Robot Duşlar");
  });

  it("keeps TPS Pano products in their exact catalog categories", () => {
    const meterPanel = classifyCatalogProduct({
      sourceKey: "catalog-tps-pano-2026-08-14",
      name: "Çift Sayaç Muhafaza Panosu 60x70x22",
      category: "Metal Muhafaza Panoları",
      categoryPath: ["Tesisat", "Sayaç ve Kollektör Panoları", "Metal Muhafaza Panoları"]
    });
    const heatPumpFoot = classifyCatalogProduct({
      sourceKey: "catalog-tps-pano-2026-08-14",
      name: "Ayarlanabilir Isı Pompası Ayağı 60x30",
      category: "Isı Pompası Ayakları",
      categoryPath: ["Isıtma ve Soğutma", "Isı Pompası Aksesuarları", "Isı Pompası Ayakları"]
    });

    expect(meterPanel.groupSlug).toBe("su-tesisati");
    expect(meterPanel.categorySlug).toBe("tesisat-panolari");
    expect(heatPumpFoot.groupSlug).toBe("pompa-hidrofor");
    expect(heatPumpFoot.categorySlug).toBe("pompa-aksesuar");
  });

  it("keeps every Sayım catalog product under Sulama & Bahçe", () => {
    const hoseMender = classifyCatalogProduct({
      sourceKey: "catalog-pdfler-sayim-2026-fiyat-listesi",
      name: "Normal Hortum Eki 1/2 inç",
      category: "Hortum Ekleri",
      categoryPath: ["Bahçe Sulama Sistemleri", "Hortum Ekleri"]
    });
    const dripMender = classifyCatalogProduct({
      sourceKey: "catalog-pdfler-sayim-2026-fiyat-listesi",
      name: "Kurtağzı Ekleme Nipeli",
      category: "Damlama Ek Parçaları",
      categoryPath: ["Damlama Sulama Sistemleri", "Damlama Ek Parçaları"]
    });

    expect(hoseMender.groupSlug).toBe("sulama-bahce");
    expect(dripMender.groupSlug).toBe("sulama-bahce");
    expect(dripMender.categorySlug).toBe("damlama");
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

  const priceStore = () =>
    mergeImportedProducts(
      createEmptyCatalogStore(),
      [
        { ...imported, externalId: "A-1", sku: "A-1", listPrice: "100.00", currency: "TRY" },
        { ...imported, externalId: "A-2", sku: "A-2", listPrice: "0", currency: "TRY" }
      ],
      "2026-07-07T01:00:00.000Z"
    );
  const priceIds = ["supplier:euromix-stock:a-1", "supplier:euromix-stock:a-2"];
  const priceOf = (result: { store: CatalogStore }, sku: string) => result.store.products.find((p) => p.sku === sku)?.listPrice;

  it("yüzde zam uygular ve fiyatsız ürüne dokunmaz", () => {
    const result = applyPriceOperation(priceStore(), priceIds, { mode: "percent", value: 30 }, {}, "admin");

    expect(result.updated).toBe(1);
    expect(result.skippedZeroPrice).toBe(1);
    expect(priceOf(result, "A-1")).toBe("130.00");
    expect(priceOf(result, "A-2")).toBe("0");
    expect(result.auditLogs[0]?.action).toBe("PRODUCT_BULK_PRICE");
  });

  it("yüzde iskonto negatif değerle çalışır", () => {
    const result = applyPriceOperation(priceStore(), priceIds, { mode: "percent", value: -16 }, {}, "admin");
    expect(priceOf(result, "A-1")).toBe("84.00");
  });

  it("sabit tutar ekler ve düşer", () => {
    expect(priceOf(applyPriceOperation(priceStore(), priceIds, { mode: "amount", value: 25 }, {}, "admin"), "A-1")).toBe("125.00");
    expect(priceOf(applyPriceOperation(priceStore(), priceIds, { mode: "amount", value: -25 }, {}, "admin"), "A-1")).toBe("75.00");
  });

  it("sonucu negatife düşürecek tutarı uygulamaz, atlar", () => {
    const result = applyPriceOperation(priceStore(), priceIds, { mode: "amount", value: -500 }, {}, "admin");
    expect(result.updated).toBe(0);
    expect(result.skippedNegative).toBe(1);
    expect(priceOf(result, "A-1")).toBe("100.00");
  });

  it("sabit fiyat atar; fiyatsız ürüne de yazar", () => {
    const result = applyPriceOperation(priceStore(), priceIds, { mode: "set", value: 49.9 }, {}, "admin");
    expect(result.updated).toBe(2);
    expect(priceOf(result, "A-1")).toBe("49.90");
    expect(priceOf(result, "A-2")).toBe("49.90");
    // Fiyatsizken "fiyat sorunuz" olan urun fiyat verilince normal gosterime doner.
    const revived = result.store.products.find((p) => p.sku === "A-2")!;
    expect(revived.priceDisplayMode).toBe("HIDDEN_UNTIL_DEALER");
    expect(revived.priceApprovalStatus).toBe("APPROVED");
  });

  it("fiyatı kaldırır; ürün fiyat sorunuz durumuna döner", () => {
    const result = applyPriceOperation(priceStore(), priceIds, { mode: "clear" }, {}, "admin");
    expect(result.updated).toBe(1);
    expect(priceOf(result, "A-1")).toBe("0");
    expect(toPublicProduct(result.store.products.find((p) => p.sku === "A-1")!).priceDisplayMode).toBe("CONTACT_REP");
  });

  it("karışık para biriminde sabit tutar işlemini reddeder", () => {
    const store = mergeImportedProducts(
      createEmptyCatalogStore(),
      [
        { ...imported, externalId: "C-1", sku: "C-1", listPrice: "100.00", currency: "TRY" },
        { ...imported, externalId: "C-2", sku: "C-2", listPrice: "100.00", currency: "USD" }
      ],
      "2026-07-07T01:00:00.000Z"
    );
    const ids = ["supplier:euromix-stock:c-1", "supplier:euromix-stock:c-2"];

    expect(() => applyPriceOperation(store, ids, { mode: "amount", value: -50 }, {}, "admin")).toThrow(/tek para birimi/);
    expect(() => applyPriceOperation(store, ids, { mode: "set", value: 50 }, {}, "admin")).toThrow(/tek para birimi/);
    // Yuzde islemi para biriminden bagimsizdir, engellenmez.
    expect(() => applyPriceOperation(store, ids, { mode: "percent", value: 10 }, {}, "admin")).not.toThrow();
  });

  it("tam sayıya yuvarlar", () => {
    const store = mergeImportedProducts(createEmptyCatalogStore(), [{ ...imported, listPrice: "33.33" }], "2026-07-07T01:00:00.000Z");
    const result = applyPriceOperation(store, ["supplier:euromix-stock:rbt-007"], { mode: "percent", value: 15 }, { rounding: "integer" }, "admin");
    expect(result.store.products[0]?.listPrice).toBe("38");
  });

  it("aralık dışı değerleri reddeder, fiyatları bozmaz", () => {
    const store = priceStore();
    const bad: Array<Parameters<typeof applyPriceOperation>[2]> = [
      { mode: "percent", value: 0 },
      { mode: "percent", value: -100 },
      { mode: "percent", value: 901 },
      { mode: "percent", value: Number.NaN },
      { mode: "amount", value: 0 },
      { mode: "set", value: -1 }
    ];
    for (const operation of bad) {
      expect(() => applyPriceOperation(store, priceIds, operation, {}, "admin"), JSON.stringify(operation)).toThrow();
    }
  });

  it("deletes only the selected products and reports the count", () => {
    const store = mergeImportedProducts(
      createEmptyCatalogStore(),
      [
        { ...imported, externalId: "A-1", sku: "A-1" },
        { ...imported, externalId: "A-2", sku: "A-2" }
      ],
      "2026-07-07T01:00:00.000Z"
    );

    const result = deleteProducts(store, ["supplier:euromix-stock:a-1"], "admin");

    expect(result.deleted).toBe(1);
    expect(result.store.products.map((p) => p.sku)).toEqual(["A-2"]);
    expect(result.store.importSummary.importedRows).toBe(1);
    expect(result.auditLogs[0]?.action).toBe("PRODUCT_BULK_DELETE");
  });

  it("hides a product from the storefront when it is set passive", () => {
    const published = publishProducts(
      mergeImportedProducts(createEmptyCatalogStore(), [imported], "2026-07-07T01:00:00.000Z"),
      ["supplier:euromix-stock:rbt-007"],
      "admin"
    ).store;

    const result = setProductsStatus(published, ["supplier:euromix-stock:rbt-007"], "PASSIVE", "admin");

    expect(result.changed).toBe(1);
    expect(result.store.products[0]?.status).toBe("PASSIVE");
    expect(result.store.products[0]?.isVisible).toBe(false);
    expect(searchCatalogRecords(result.store, { publicOnly: true }).total).toBe(0);
  });

  it("veri kalitesi süzgeçleri fiyatsız ve görselsiz ürünleri ayırır", () => {
    const store = mergeImportedProducts(
      createEmptyCatalogStore(),
      [
        { ...imported, externalId: "F-1", sku: "F-1", listPrice: "100.00", imageUrl: "https://cdn.example.com/a.png" },
        { ...imported, externalId: "F-2", sku: "F-2", listPrice: "0", imageUrl: "https://cdn.example.com/b.png" },
        { ...imported, externalId: "F-3", sku: "F-3", listPrice: "50.00", imageUrl: "" }
      ],
      "2026-07-07T01:00:00.000Z"
    );

    expect(searchCatalogRecords(store, { priceState: "zero" }).items.map((p) => p.sku)).toEqual(["F-2"]);
    expect(searchCatalogRecords(store, { priceState: "priced" }).total).toBe(2);
    expect(searchCatalogRecords(store, { imageState: "without" }).items.map((p) => p.sku)).toEqual(["F-3"]);
    expect(searchCatalogRecords(store, { imageState: "with" }).total).toBe(2);
    // Suzgecler birlikte calisir: hem fiyatsiz hem gorselli
    expect(searchCatalogRecords(store, { priceState: "zero", imageState: "with" }).total).toBe(1);
    // "all" hicbir seyi elemez
    expect(searchCatalogRecords(store, { priceState: "all", imageState: "all" }).total).toBe(3);
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
