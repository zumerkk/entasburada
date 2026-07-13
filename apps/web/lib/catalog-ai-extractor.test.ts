import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  canonicalLamindoorProductIdentity,
  canonicalFloorpanModelCode,
  extractStructuredLamindoorPage,
  mergeCatalogPageExtractions,
  normalizeFloorpanCatalogProducts,
  parseCatalogPagePayload,
  qualifyGenericCatalogModelIdentities,
  reconcileCatalogOcrPhasePairs,
  type CatalogAiProductCandidate,
  type CatalogPageExtraction
} from "./catalog-ai-extractor";

describe("catalog AI response parser", () => {
  it("normalizes currencies, image regions and product fields", () => {
    const parsed = parseCatalogPagePayload({
      pageBrand: "TAIFU",
      pageCategory: "Su Pompaları",
      pageCurrency: "$",
      warnings: [],
      products: [
        {
          sourceRecordId: "TPS-550",
          sku: "TPS-550",
          barcode: null,
          manufacturerCode: "TPS-550",
          name: "Paslanmaz Dalgıç Pompa",
          brand: "TAIFU",
          category: "Dalgıç Pompa",
          description: "550 W temiz su pompası",
          listPrice: 149.5,
          currency: "$",
          taxRate: 20,
          unitType: "Adet",
          stockQuantity: null,
          stockStatus: "unknown",
          minOrder: 1,
          packageQuantity: 1,
          cartonQuantity: 4,
          palletQuantity: null,
          warrantyMonths: 24,
          technicalSpecs: [
            { label: "Güç", value: "550 W" },
            { label: "Güç", value: "550 W" }
          ],
          imageRegion: { x: -20, y: 50, width: 400, height: 500 },
          confidence: 92,
          warnings: []
        }
      ]
    });

    expect(parsed.pageCurrency).toBe("USD");
    expect(parsed.products).toHaveLength(1);
    expect(parsed.products[0]).toMatchObject({
      sku: "TPS-550",
      currency: "USD",
      listPrice: 149.5,
      stockQuantity: null,
      stockStatus: "unknown",
      imageRegion: { x: 0, y: 50, width: 400, height: 500 }
    });
    expect(parsed.products[0]?.technicalSpecs).toEqual([{ label: "Güç", value: "550 W" }]);
  });

  it("drops rows without a product name and strips markdown fences", () => {
    const parsed = parseCatalogPagePayload(`\`\`\`json
      {"pageBrand":null,"pageCategory":null,"pageCurrency":"TL","warnings":[],"products":[
        {"name":"","confidence":80},
        {"name":"Vidalı Kelepçe","sku":"VK-20","stockStatus":"in_stock","confidence":"81","warnings":[]}
      ]}
    \`\`\``);

    expect(parsed.products).toHaveLength(1);
    expect(parsed.products[0]?.name).toBe("Vidalı Kelepçe");
    expect(parsed.products[0]?.confidence).toBe(81);
    expect(parsed.pageCurrency).toBe("TRY");
  });

  it("merges both providers without dropping rows found by only one model", () => {
    const openAi = extraction("openai", [
      candidate({ sku: "TW 370", name: "TAIFU TW 370 Santrifüj Pompa", confidence: 94 }),
      candidate({ sku: "TW 750", name: "TAIFU TW 750 Santrifüj Pompa", confidence: 91 })
    ]);
    const gemini = extraction("gemini", [
      candidate({ sku: "TW370", name: "TW370 Santrifüj Pompa", confidence: 90 }),
      candidate({ sku: "QB60", name: "TAIFU QB60 Çevresel Pompa", confidence: 88 })
    ]);

    const merged = mergeCatalogPageExtractions(openAi, gemini);

    expect(merged.provider).toBe("consensus");
    expect(merged.products).toHaveLength(3);
    expect(merged.verification).toEqual({
      openAiProducts: 2,
      geminiProducts: 2,
      matchedProducts: 1,
      openAiOnlyProducts: 1,
      geminiOnlyProducts: 1,
      conflictingProducts: 0,
      discardedUnsubstantiatedProducts: 0
    });
    expect(merged.products.find((product) => product.sku === "TW 750")?.warnings.join(" ")).toContain("yalnızca OpenAI");
    expect(merged.products.find((product) => product.sku === "QB60")?.warnings.join(" ")).toContain("yalnızca Gemini");
  });

  it("records commercial conflicts instead of silently hiding provider disagreement", () => {
    const openAi = extraction("openai", [candidate({
      sku: "QB80",
      name: "QB80 Pompa",
      listPrice: 120,
      stockQuantity: 4,
      confidence: 92,
      technicalSpecs: [{ label: "Güç", value: "0.75 kW" }]
    })]);
    const gemini = extraction("gemini", [candidate({
      sku: "QB80",
      name: "QB80 Pompa",
      listPrice: 125,
      stockQuantity: 7,
      confidence: 90,
      technicalSpecs: [{ label: "Güç (kW)", value: "0.75" }]
    })]);

    const merged = mergeCatalogPageExtractions(openAi, gemini);

    expect(merged.verification?.conflictingProducts).toBe(1);
    expect(merged.products[0]?.warnings.join(" ")).toContain("fiyat: 120 / 125");
    expect(merged.products[0]?.warnings.join(" ")).toContain("stok: 4 / 7");
    expect(merged.products[0]?.technicalSpecs).toEqual([{ label: "Güç", value: "0.75 kW" }]);
  });

  it("does not turn an unverified cover image into a generic product", () => {
    const openAi = extraction("openai", [candidate({
      name: "TAIFU su pompası",
      confidence: 70,
      warnings: ["Model veya SKU görünmüyor."]
    })]);
    const gemini = extraction("gemini", []);

    const merged = mergeCatalogPageExtractions(openAi, gemini);

    expect(merged.products).toHaveLength(0);
    expect(merged.verification?.discardedUnsubstantiatedProducts).toBe(1);
  });

  it("matches power variants even when one provider includes the kW unit in the identity", () => {
    const openAi = extraction("openai", [candidate({ sku: "0.37 (220W)", name: "Yağ Soğutmalı Dalgıç Motor 0.37", confidence: 88 })]);
    const gemini = extraction("gemini", [candidate({ sku: "0.37 kW (220W)", name: "Yağ Soğutmalı Dalgıç Motor 0.37 kW", confidence: 84 })]);

    const merged = mergeCatalogPageExtractions(openAi, gemini);

    expect(merged.products).toHaveLength(1);
    expect(merged.verification?.matchedProducts).toBe(1);
  });

  it("repairs a dropped single-phase M marker without merging a real 380V variant", () => {
    const sharedSpecs = [
      { label: "Güç", value: "1.85 kW" },
      { label: "Yükseklik", value: "60 m" }
    ];
    const openAi = extraction("openai", [
      candidate({
        sku: "TLP4-7",
        name: "TLP-M Çok Kademeli Dik Milli Pompa",
        technicalSpecs: [...sharedSpecs, { label: "Voltaj/Frekans", value: "220V/50Hz" }]
      }),
      candidate({
        sku: "TLP4-6",
        name: "TLP4-6",
        technicalSpecs: [{ label: "Güç", value: "1.5 kW" }, { label: "Voltaj/Frekans", value: "380V/50Hz" }]
      })
    ]);
    const gemini = extraction("gemini", [
      candidate({
        sku: "TLPM4-7",
        name: "TLP-M Çok Kademeli Dik Milli Pompa",
        technicalSpecs: [...sharedSpecs, { label: "Voltaj/Frekans", value: "220V/50Hz" }]
      }),
      candidate({
        sku: "TLPM4-6",
        name: "TLPM4-6",
        technicalSpecs: [{ label: "Güç", value: "1.5 kW" }, { label: "Voltaj/Frekans", value: "220V/50Hz" }]
      })
    ]);

    const merged = mergeCatalogPageExtractions(openAi, gemini);

    expect(merged.products.map((product) => product.sku).sort()).toEqual(["TLP4-6", "TLPM4-6", "TLPM4-7"]);
    expect(merged.verification?.matchedProducts).toBe(1);
  });

  it("does not match distinct SKUs merely because providers use the same family name", () => {
    const openAi = extraction("openai", [candidate({ sku: "MODEL-100", name: "Ortak Pompa Ailesi" })]);
    const gemini = extraction("gemini", [candidate({ sku: "MODEL-200", name: "Ortak Pompa Ailesi" })]);

    const merged = mergeCatalogPageExtractions(openAi, gemini);

    expect(merged.products).toHaveLength(2);
    expect(merged.verification?.matchedProducts).toBe(0);
  });

  it("drops a model-family heading that is not a sellable table row", () => {
    const openAi = extraction("openai", []);
    const gemini = extraction("gemini", [candidate({
      sku: "4STM3-4-6-8-16",
      name: "4STM3-4-6-8-16 Derin Kuyu Dalgıçları",
      technicalSpecs: [{ label: "Tür", value: "Derin kuyu" }]
    })]);

    const merged = mergeCatalogPageExtractions(openAi, gemini);

    expect(merged.products).toHaveLength(0);
    expect(merged.verification?.discardedUnsubstantiatedProducts).toBe(1);
  });

  it("recovers a phase sibling only when OCR found both codes on the same row", () => {
    const base = extraction("openai", [candidate({
      sourceRecordId: "4STM6-8",
      sku: "4STM6-8",
      manufacturerCode: "4STM6-8",
      name: "4STM6-8",
      technicalSpecs: [
        { label: "Güç", value: "0.75 kW" },
        { label: "Faz", value: "Tek faz (220V)" },
        { label: "Akım", value: "4.2 A" }
      ]
    })]);

    const reconciled = reconcileCatalogOcrPhasePairs(base, [{ singlePhase: "4STM6-8", threePhase: "4ST6-8" }]);

    expect(reconciled.products.map((product) => product.sku)).toEqual(["4STM6-8", "4ST6-8"]);
    expect(reconciled.products[1]?.technicalSpecs).toContainEqual({ label: "Faz", value: "Üç faz (380V)" });
    expect(reconciled.products[1]?.technicalSpecs.some((spec) => spec.label === "Akım")).toBe(false);
    expect(reconciled.warnings.join(" ")).toContain("4ST6-8");
  });

  it("recovers a missing OCR-confirmed 4ST phase code without inventing the dash-side variant", () => {
    const base = extraction("openai", [
      candidate({ sourceRecordId: "4STM6-8", sku: "4STM6-8", manufacturerCode: "4STM6-8", name: "4STM6-8" }),
      candidate({ sourceRecordId: "4ST6-47", sku: "4ST6-47", manufacturerCode: "4ST6-47", name: "4ST6-47" })
    ]);

    const reconciled = reconcileCatalogOcrPhasePairs(base, [], ["4ST6-8", "4ST6-47"]);

    expect(reconciled.products.map((product) => product.sku)).toContain("4ST6-8");
    expect(reconciled.products.map((product) => product.sku)).not.toContain("4STM6-47");
  });
});

describe("generic catalog model identities", () => {
  it("qualifies repeated MODEL codes with the visible collection heading", () => {
    const base = extraction("openai", [candidate({ sourceRecordId: "MODEL 4", sku: "MODEL 4", name: "MODEL 4" })]);
    const qualified = qualifyGenericCatalogModelIdentities(
      base,
      "Çizilmeye Dayanıklı   Solmaz Renkler   Ayder\nMODEL 4   MODEL 5\nPANEL ÖLÇÜLERİ 2100-2400 mm"
    );

    expect(qualified.products[0]).toMatchObject({
      sku: "Ayder MODEL 4",
      sourceRecordId: "Ayder MODEL 4",
      name: "Ayder MODEL 4"
    });
  });

  it("does not rewrite an already qualified supplier model", () => {
    const base = extraction("openai", [candidate({ sourceRecordId: "SARUHAN MODEL 4", sku: "SARUHAN MODEL 4", name: "Saruhan Model 4" })]);
    const qualified = qualifyGenericCatalogModelIdentities(base, "Saruhan\nMODEL 4");
    expect(qualified.products[0]?.sku).toBe("SARUHAN MODEL 4");
  });
});

describe("Floorpan catalog normalization", () => {
  it("keeps only explicit decor codes and canonicalizes their identities", () => {
    const base = extraction("openai", [
      candidate({ sku: "FS037 ELEGANCE", name: "Elegance Meşe" }),
      candidate({ sku: null, name: "Sınıf 21 kullanım alanları" }),
      candidate({ sku: "AT.1", name: "Katman yapısı" }),
      candidate({ sku: null, name: "Unknown decor visual" })
    ]);

    const normalized = normalizeFloorpanCatalogProducts(base, "Pdfler / floorpan-sun-2024-tr");

    expect(normalized.products).toHaveLength(1);
    expect(normalized.products[0]).toMatchObject({
      sourceRecordId: "FS037",
      sku: "FS037",
      manufacturerCode: "FS037"
    });
    expect(normalized.warnings.join(" ")).toContain("3 kodsuz");
  });

  it("normalizes Sunex and Stonex code formatting", () => {
    expect(canonicalFloorpanModelCode("FSX1")).toBe("FSX01");
    expect(canonicalFloorpanModelCode("FT16 CRATER")).toBe("FT016");
    expect(canonicalFloorpanModelCode("FS 5")).toBe("FS005");
    expect(canonicalFloorpanModelCode("Katman yapısı")).toBe("");
  });
});

describe("Lamindoor structured catalog extraction", () => {
  it("extracts printed GZZ codes and their visible finish descriptions", () => {
    const parsed = extractStructuredLamindoorPage(
      "Beyaz - Gazez Ceviz   GZZ 1046\nAntrasit - Ayder   GZZ 1044",
      "Pdfler / Lamindoor_2024_S",
      61
    );

    expect(parsed?.products.map((product) => [product.sku, product.name])).toEqual([
      ["GZZ 1046", "GZZ 1046 Beyaz - Gazez Ceviz"],
      ["GZZ 1044", "GZZ 1044 Antrasit - Ayder"]
    ]);
    expect(parsed?.products[0]?.imageRegion?.x).toBeGreaterThan(400);
    expect(parsed?.products[1]?.imageRegion?.x).toBeLessThan(250);
  });

  it("uses the real collection heading instead of feature icon text", () => {
    const parsed = extractStructuredLamindoorPage(
      "Isıya Dayanıklı Çizilmeye Dayanıklı Solmaz Renkler Hızlı Montaj Ozigo\nPANEL ÖLÇÜLERİ\nMODEL 1",
      "Pdfler / Lamindoor_2024_S"
    );

    expect(parsed?.products).toHaveLength(1);
    expect(parsed?.products[0]?.sku).toBe("OZIGO MODEL 1");
  });

  it("canonicalizes spelling and separator variants without accepting OCR noise", () => {
    expect(canonicalLamindoorProductIdentity("ANTRASİL-MODEL-1")).toBe("ANTRASIT MODEL 1");
    expect(canonicalLamindoorProductIdentity("Gazez Ceviz Model 4")).toBe("GAZEZ CEVIZ MODEL 4");
    expect(canonicalLamindoorProductIdentity("GZZ-01046 Beyaz")).toBe("GZZ 1046");
    expect(canonicalLamindoorProductIdentity("GZZ 101 Beyaz")).toBe("GZZ 101 - BEYAZ");
    expect(canonicalLamindoorProductIdentity("1.DAYANIKL")).toBe("");
  });

  it("creates a separate SKU per GZZ surface and maps each model to its own door", () => {
    const parsed = extractStructuredLamindoorPage(
      "Topkapı GZZ 102\nGZZ 101\nGZZ 103",
      "Pdfler / Lamindoor_2024_S",
      6
    );

    expect(parsed?.products.map((product) => product.sku)).toEqual([
      "GZZ 102 - TOPKAPI",
      "GZZ 101 - TOPKAPI",
      "GZZ 103 - TOPKAPI"
    ]);
    expect(parsed?.products[0]?.imageRegion?.x).toBeGreaterThan(600);
    expect(parsed?.products[1]?.imageRegion?.x).toBeLessThan(300);
    expect(parsed?.products[2]?.imageRegion?.y).toBeGreaterThan(400);
  });
});

function extraction(provider: "openai" | "gemini", products: CatalogAiProductCandidate[]): CatalogPageExtraction {
  return {
    provider,
    model: provider === "openai" ? "openai-test" : "gemini-test",
    pageBrand: "TAIFU",
    pageCategory: "Su Pompaları",
    pageCurrency: "USD",
    products,
    warnings: []
  };
}

function candidate(overrides: Partial<CatalogAiProductCandidate>): CatalogAiProductCandidate {
  return {
    sourceRecordId: null,
    sku: null,
    barcode: null,
    manufacturerCode: null,
    name: "Test ürün",
    brand: "TAIFU",
    category: "Pompa",
    description: null,
    listPrice: null,
    currency: "USD",
    taxRate: null,
    unitType: "Adet",
    stockQuantity: null,
    stockStatus: "unknown",
    minOrder: null,
    packageQuantity: null,
    cartonQuantity: null,
    palletQuantity: null,
    warrantyMonths: null,
    technicalSpecs: [],
    imageCandidateIndex: null,
    imageRegion: null,
    confidence: 90,
    warnings: [],
    ...overrides
  };
}
