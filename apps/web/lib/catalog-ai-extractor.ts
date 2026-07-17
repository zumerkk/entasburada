import "server-only";

export type CatalogAiProvider = "openai" | "gemini";

export interface CatalogVerificationSummary {
  openAiProducts: number;
  geminiProducts: number;
  matchedProducts: number;
  openAiOnlyProducts: number;
  geminiOnlyProducts: number;
  conflictingProducts: number;
  discardedUnsubstantiatedProducts: number;
}

export interface CatalogExtractionHints {
  fileName: string;
  pageNumber: number;
  pageCount: number;
  sourceName: string;
  brandHint?: string;
  categoryHint?: string;
  defaultCurrency?: string;
  imageCandidates?: Array<{ index: number; region: CatalogImageRegion }>;
  ocrModelCandidates?: string[];
}

export interface CatalogImageRegion {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface CatalogAiProductCandidate {
  sourceRecordId: string | null;
  sku: string | null;
  barcode: string | null;
  manufacturerCode: string | null;
  name: string;
  brand: string | null;
  category: string | null;
  description: string | null;
  listPrice: number | null;
  currency: string | null;
  taxRate: number | null;
  unitType: string | null;
  stockQuantity: number | null;
  stockStatus: "in_stock" | "low_stock" | "incoming" | "out_of_stock" | "unknown";
  minOrder: number | null;
  packageQuantity: number | null;
  cartonQuantity: number | null;
  palletQuantity: number | null;
  warrantyMonths: number | null;
  technicalSpecs: Array<{ label: string; value: string }>;
  imageCandidateIndex: number | null;
  imageRegion: CatalogImageRegion | null;
  confidence: number;
  warnings: string[];
}

export interface CatalogPageExtraction {
  provider: CatalogAiProvider | "consensus" | "text_fallback";
  model: string;
  pageBrand: string | null;
  pageCategory: string | null;
  pageCurrency: string | null;
  products: CatalogAiProductCandidate[];
  warnings: string[];
  verification?: CatalogVerificationSummary;
}

export interface CatalogImageLocationResult {
  provider: CatalogAiProvider | "consensus";
  model: string;
  matches: Array<{ productKey: string; imageCandidateIndex: number | null; imageRegion: CatalogImageRegion | null }>;
  warnings: string[];
}

const CATALOG_PAGE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["pageBrand", "pageCategory", "pageCurrency", "products", "warnings"],
  properties: {
    pageBrand: nullableStringSchema(),
    pageCategory: nullableStringSchema(),
    pageCurrency: nullableStringSchema(),
    warnings: { type: "array", items: { type: "string" }, maxItems: 30 },
    products: {
      type: "array",
      maxItems: 160,
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "sourceRecordId",
          "sku",
          "barcode",
          "manufacturerCode",
          "name",
          "brand",
          "category",
          "description",
          "listPrice",
          "currency",
          "taxRate",
          "unitType",
          "stockQuantity",
          "stockStatus",
          "minOrder",
          "packageQuantity",
          "cartonQuantity",
          "palletQuantity",
          "warrantyMonths",
          "technicalSpecs",
          "imageCandidateIndex",
          "imageRegion",
          "confidence",
          "warnings"
        ],
        properties: {
          sourceRecordId: nullableStringSchema(),
          sku: nullableStringSchema(),
          barcode: nullableStringSchema(),
          manufacturerCode: nullableStringSchema(),
          name: { type: "string" },
          brand: nullableStringSchema(),
          category: nullableStringSchema(),
          description: nullableStringSchema(),
          listPrice: nullableNumberSchema(0),
          currency: nullableStringSchema(),
          taxRate: nullableNumberSchema(0, 100),
          unitType: nullableStringSchema(),
          stockQuantity: nullableNumberSchema(0),
          stockStatus: {
            type: "string",
            enum: ["in_stock", "low_stock", "incoming", "out_of_stock", "unknown"]
          },
          minOrder: nullableNumberSchema(0),
          packageQuantity: nullableNumberSchema(0),
          cartonQuantity: nullableNumberSchema(0),
          palletQuantity: nullableNumberSchema(0),
          warrantyMonths: nullableNumberSchema(0),
          technicalSpecs: {
            type: "array",
            maxItems: 60,
            items: {
              type: "object",
              additionalProperties: false,
              required: ["label", "value"],
              properties: {
                label: { type: "string" },
                value: { type: "string" }
              }
            }
          },
          imageCandidateIndex: { type: ["integer", "null"], minimum: 0 },
          imageRegion: {
            type: ["object", "null"],
            additionalProperties: false,
            required: ["x", "y", "width", "height"],
            properties: {
              x: { type: "number", minimum: 0, maximum: 1000 },
              y: { type: "number", minimum: 0, maximum: 1000 },
              width: { type: "number", minimum: 1, maximum: 1000 },
              height: { type: "number", minimum: 1, maximum: 1000 }
            }
          },
          confidence: { type: "number", minimum: 0, maximum: 100 },
          warnings: { type: "array", items: { type: "string" }, maxItems: 30 }
        }
      }
    }
  }
} as const;

const IMAGE_LOCATION_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["matches", "warnings"],
  properties: {
    warnings: { type: "array", items: { type: "string" }, maxItems: 30 },
    matches: {
      type: "array",
      maxItems: 160,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["productKey", "imageCandidateIndex", "imageRegion"],
        properties: {
          productKey: { type: "string" },
          imageCandidateIndex: { type: ["integer", "null"], minimum: 0 },
          imageRegion: CATALOG_PAGE_SCHEMA.properties.products.items.properties.imageRegion
        }
      }
    }
  }
} as const;

export async function extractCatalogPageWithAi(input: {
  imageBase64: string;
  coordinateImageBase64?: string;
  pageText: string;
  hints: CatalogExtractionHints;
}): Promise<CatalogPageExtraction> {
  const configured = clean(process.env.CATALOG_AI_PROVIDER).toLowerCase();
  const providers: CatalogAiProvider[] =
    configured === "openai" || configured === "gemini" ? [configured] : ["openai", "gemini"];
  const availableProviders = providers.filter(providerConfigured);
  const errors: string[] = [];

  if (configured !== "openai" && configured !== "gemini" && process.env.CATALOG_DEEP_VERIFY !== "false" && availableProviders.length > 1) {
    const results = await Promise.allSettled(availableProviders.map((provider) =>
      provider === "openai" ? extractWithOpenAi(input) : extractWithGemini(input)
    ));
    const successful = results.flatMap((result, index) => {
      if (result.status === "fulfilled") return [result.value];
      errors.push(`${availableProviders[index]}: ${safeErrorMessage(result.reason)}`);
      return [];
    });

    if (successful.length === 2) {
      let openAi = successful.find((result) => result.provider === "openai");
      const gemini = successful.find((result) => result.provider === "gemini");
      if (openAi && gemini) {
        if (shouldRunCompletenessAudit(openAi, gemini)) {
          try {
            const audit = await extractWithOpenAi(input, { completenessAuditProducts: openAi.products });
            openAi = mergeSameProviderPasses(openAi, audit);
          } catch (error) {
            errors.push(`openai-completeness-audit: ${safeErrorMessage(error)}`);
          }
        }
        const merged = mergeCatalogPageExtractions(openAi, gemini);
        return errors.length ? { ...merged, warnings: uniqueStrings([...merged.warnings, ...errors]) } : merged;
      }
    }

    if (successful.length === 1) {
      let verified = successful[0]!;
      if (
        verified.provider === "openai" &&
        verified.products.length > 0 &&
        process.env.CATALOG_COMPLETENESS_AUDIT !== "false"
      ) {
        try {
          const audit = await extractWithOpenAi(input, { completenessAuditProducts: verified.products });
          verified = mergeSameProviderPasses(verified, audit);
        } catch (error) {
          errors.push(`openai-completeness-audit: ${safeErrorMessage(error)}`);
        }
      }
      return {
        ...verified,
        warnings: uniqueStrings([
          ...verified.warnings,
          `Çift AI doğrulaması tamamlanamadı; yalnızca ${verified.provider} sonucu iki geçişli tamlık denetimiyle kullanıldı.`,
          ...errors
        ])
      };
    }
  }

  for (const provider of providers) {
    if (!providerConfigured(provider)) {
      errors.push(`${provider}: API anahtarı tanımlı değil`);
      continue;
    }

    try {
      return provider === "openai" ? await extractWithOpenAi(input) : await extractWithGemini(input);
    } catch (error) {
      errors.push(`${provider}: ${safeErrorMessage(error)}`);
    }
  }

  throw new Error(`AI katalog çıkarımı başarısız. ${errors.join(" | ")}`);
}

export function mergeCatalogPageExtractions(
  openAi: CatalogPageExtraction,
  gemini: CatalogPageExtraction
): CatalogPageExtraction {
  const unusedGemini = new Set(gemini.products.map((_, index) => index));
  const products: CatalogAiProductCandidate[] = [];
  let matchedProducts = 0;
  let conflictingProducts = 0;
  let openAiOnlyProducts = 0;
  let discardedUnsubstantiatedProducts = 0;

  for (const openAiProduct of openAi.products) {
    const match = bestCandidateMatch(openAiProduct, gemini.products, unusedGemini);
    if (match === null) {
      openAiOnlyProducts += 1;
      if (isSubstantiatedSingleProviderProduct(openAiProduct)) products.push(singleProviderCandidate(openAiProduct, "OpenAI"));
      else discardedUnsubstantiatedProducts += 1;
      continue;
    }

    unusedGemini.delete(match);
    matchedProducts += 1;
    const merged = mergeProductCandidates(openAiProduct, gemini.products[match]!);
    if (merged.conflictCount > 0) conflictingProducts += 1;
    products.push(merged.product);
  }

  for (const index of unusedGemini) {
    const geminiProduct = gemini.products[index]!;
    if (isSubstantiatedSingleProviderProduct(geminiProduct)) products.push(singleProviderCandidate(geminiProduct, "Gemini"));
    else discardedUnsubstantiatedProducts += 1;
  }

  const pageWarnings = mergePageMetadataWarnings(openAi, gemini);
  const verification: CatalogVerificationSummary = {
    openAiProducts: openAi.products.length,
    geminiProducts: gemini.products.length,
    matchedProducts,
    openAiOnlyProducts,
    geminiOnlyProducts: unusedGemini.size,
    conflictingProducts,
    discardedUnsubstantiatedProducts
  };

  return {
    provider: "consensus",
    model: `${openAi.model}+${gemini.model}`,
    pageBrand: preferredText(openAi.pageBrand, gemini.pageBrand),
    pageCategory: preferredText(openAi.pageCategory, gemini.pageCategory),
    pageCurrency: preferredText(openAi.pageCurrency, gemini.pageCurrency),
    products,
    warnings: uniqueStrings([
      ...openAi.warnings.map((warning) => `OpenAI: ${warning}`),
      ...gemini.warnings.map((warning) => `Gemini: ${warning}`),
      ...pageWarnings,
      ...(discardedUnsubstantiatedProducts ? [`${discardedUnsubstantiatedProducts} tek-sağlayıcı kayıt somut model/ticari veri içermediği için ürün olarak alınmadı.`] : []),
      `Çift AI denetimi: OpenAI ${verification.openAiProducts}, Gemini ${verification.geminiProducts}, eşleşen ${matchedProducts}, yalnız OpenAI ${openAiOnlyProducts}, yalnız Gemini ${unusedGemini.size}, çatışmalı ${conflictingProducts}.`
    ]),
    verification
  };
}

export function reconcileCatalogOcrPhasePairs(
  extraction: CatalogPageExtraction,
  phasePairs: Array<{ singlePhase: string; threePhase: string }>,
  ocrModelCandidates: string[] = []
): CatalogPageExtraction {
  if (phasePairs.length === 0 && ocrModelCandidates.length === 0) return extraction;
  const products = [...extraction.products];
  const byIdentity = new Map<string, CatalogAiProductCandidate>();
  const indexProducts = (): void => {
    byIdentity.clear();
    for (const product of products) {
      for (const identity of candidateIdentifiers(product)) byIdentity.set(identity, product);
    }
  };
  indexProducts();
  const recovered: string[] = [];
  const evidencePairs = [...phasePairs];
  for (const code of ocrModelCandidates) {
    const normalizedCode = normalizeMatchValue(code);
    if (byIdentity.has(normalizedCode)) continue;
    if (/^4STM\d+-\d+$/i.test(code)) {
      const threePhase = code.replace(/^4STM/i, "4ST");
      if (byIdentity.has(normalizeMatchValue(threePhase))) evidencePairs.push({ singlePhase: code, threePhase });
    } else if (/^4ST\d+-\d+$/i.test(code)) {
      const singlePhase = code.replace(/^4ST/i, "4STM");
      if (byIdentity.has(normalizeMatchValue(singlePhase))) evidencePairs.push({ singlePhase, threePhase: code });
    }
  }

  for (const pair of evidencePairs) {
    const singlePhase = byIdentity.get(normalizeMatchValue(pair.singlePhase));
    const threePhase = byIdentity.get(normalizeMatchValue(pair.threePhase));
    if (Boolean(singlePhase) === Boolean(threePhase)) continue;
    const source = singlePhase ?? threePhase!;
    const sourceCode = singlePhase ? pair.singlePhase : pair.threePhase;
    const missingCode = singlePhase ? pair.threePhase : pair.singlePhase;
    const isSinglePhase = missingCode === pair.singlePhase;
    products.push(cloneOcrPhaseVariant(source, sourceCode, missingCode, isSinglePhase));
    recovered.push(missingCode);
    indexProducts();
  }

  if (recovered.length === 0) return extraction;
  return {
    ...extraction,
    products,
    warnings: uniqueStrings([
      ...extraction.warnings,
      `OCR aynı-satır faz denetimi AI tarafından atlanan ${recovered.length} modeli tamamladı: ${recovered.join(", ")}.`
    ])
  };
}

function cloneOcrPhaseVariant(
  source: CatalogAiProductCandidate,
  sourceCode: string,
  missingCode: string,
  isSinglePhase: boolean
): CatalogAiProductCandidate {
  const replaceCode = (value: string | null): string | null => {
    if (!value) return value;
    return value.includes(sourceCode) ? value.replace(sourceCode, missingCode) : value;
  };
  const technicalSpecs = source.technicalSpecs.filter((spec) =>
    !/(FAZ|PHASE|VOLTAJ|VOLTAGE|AKIM|CURRENT)/.test(normalizeMatchValue(spec.label))
  );
  technicalSpecs.push({ label: "Faz", value: isSinglePhase ? "Tek faz (220V)" : "Üç faz (380V)" });
  return {
    ...source,
    sourceRecordId: missingCode,
    sku: missingCode,
    manufacturerCode: missingCode,
    name: replaceCode(source.name) || missingCode,
    description: replaceCode(source.description),
    technicalSpecs,
    confidence: Math.min(source.confidence, 76),
    warnings: uniqueStrings([
      ...source.warnings,
      `${missingCode} modeli aynı OCR tablo satırındaki ${sourceCode} faz eşinden tamamlandı; admin kontrolü gerekli.`
    ])
  };
}

export async function locateCatalogProductImagesWithAi(input: {
  imageBase64: string;
  coordinateImageBase64: string;
  products: Array<{ productKey: string; sku: string; name: string }>;
  hints: CatalogExtractionHints;
}): Promise<CatalogImageLocationResult> {
  const configured = clean(process.env.CATALOG_AI_PROVIDER).toLowerCase();
  const providers: CatalogAiProvider[] = configured === "openai" || configured === "gemini" ? [configured] : ["openai", "gemini"];
  const availableProviders = providers.filter(providerConfigured);
  const errors: string[] = [];

  if (configured !== "openai" && configured !== "gemini" && process.env.CATALOG_DEEP_VERIFY !== "false" && availableProviders.length > 1) {
    const results = await Promise.allSettled(availableProviders.map((provider) =>
      provider === "openai" ? locateWithOpenAi(input) : locateWithGemini(input)
    ));
    const successful = results.flatMap((result, index) => {
      if (result.status === "fulfilled") return [result.value];
      errors.push(`${availableProviders[index]}: ${safeErrorMessage(result.reason)}`);
      return [];
    });
    if (successful.length === 2) {
      const openAi = successful.find((result) => result.provider === "openai");
      const gemini = successful.find((result) => result.provider === "gemini");
      if (openAi && gemini) return mergeImageLocationResults(openAi, gemini, input.products.map((product) => product.productKey));
    }
    if (successful.length === 1) {
      return { ...successful[0]!, warnings: uniqueStrings([...successful[0]!.warnings, ...errors, "Görsel eşleştirme yalnızca tek AI sağlayıcısıyla tamamlandı."]) };
    }
  }

  for (const provider of providers) {
    if (!providerConfigured(provider)) continue;
    try {
      return provider === "openai" ? await locateWithOpenAi(input) : await locateWithGemini(input);
    } catch (error) {
      errors.push(`${provider}: ${safeErrorMessage(error)}`);
    }
  }
  throw new Error(`Ürün görsel konumlandırması başarısız. ${errors.join(" | ")}`);
}

function mergeImageLocationResults(
  openAi: CatalogImageLocationResult,
  gemini: CatalogImageLocationResult,
  productKeys: string[]
): CatalogImageLocationResult {
  const openByKey = new Map(openAi.matches.map((match) => [match.productKey, match]));
  const geminiByKey = new Map(gemini.matches.map((match) => [match.productKey, match]));
  const warnings = [...openAi.warnings.map((warning) => `OpenAI: ${warning}`), ...gemini.warnings.map((warning) => `Gemini: ${warning}`)];
  const matches = productKeys.map((productKey) => {
    const openMatch = openByKey.get(productKey);
    const geminiMatch = geminiByKey.get(productKey);
    if (openMatch?.imageRegion && geminiMatch?.imageRegion) {
      const sameCandidate = openMatch.imageCandidateIndex !== null && openMatch.imageCandidateIndex === geminiMatch.imageCandidateIndex;
      if (sameCandidate || regionsAgree(openMatch.imageRegion, geminiMatch.imageRegion)) {
        return openMatch;
      }
      warnings.push(`${productKey} görselinde OpenAI/Gemini farklı aday seçti; daha güçlü görsel modelinin dar OpenAI bölgesi kullanıldı ve admin kontrolü işaretlendi.`);
      return openMatch;
    }
    return openMatch?.imageRegion ? openMatch : geminiMatch?.imageRegion ? geminiMatch : { productKey, imageCandidateIndex: null, imageRegion: null };
  });
  return {
    provider: "consensus",
    model: `${openAi.model}+${gemini.model}`,
    matches,
    warnings: uniqueStrings(warnings)
  };
}

async function locateWithOpenAi(input: {
  imageBase64: string;
  coordinateImageBase64: string;
  products: Array<{ productKey: string; sku: string; name: string }>;
  hints: CatalogExtractionHints;
}): Promise<CatalogImageLocationResult> {
  const model = clean(process.env.OPENAI_CATALOG_MODEL) || "gpt-5.4-mini";
  const payload = await fetchJsonWithRetry("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { authorization: `Bearer ${process.env.OPENAI_API_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({
      model,
      store: false,
      max_output_tokens: 8000,
      input: [{
        role: "user",
        content: [
          { type: "input_text", text: buildImageLocationPrompt(input.hints, input.products) },
          { type: "input_image", image_url: `data:image/jpeg;base64,${input.imageBase64}`, detail: "high" },
          { type: "input_image", image_url: `data:image/jpeg;base64,${input.coordinateImageBase64}`, detail: "high" }
        ]
      }],
      text: { format: { type: "json_schema", name: "catalog_product_image_locations", strict: true, schema: IMAGE_LOCATION_SCHEMA } }
    })
  });
  const outputText = openAiOutputText(payload);
  if (!outputText) throw new Error("OpenAI görsel konum çıktısı bulunamadı.");
  return { ...parseImageLocationPayload(outputText, input.products, input.hints.imageCandidates ?? []), provider: "openai", model };
}

async function locateWithGemini(input: {
  imageBase64: string;
  coordinateImageBase64: string;
  products: Array<{ productKey: string; sku: string; name: string }>;
  hints: CatalogExtractionHints;
}): Promise<CatalogImageLocationResult> {
  const errors: string[] = [];
  for (const model of geminiModelCandidates()) {
    try {
      const payload = await fetchJsonWithRetry(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
        method: "POST",
        headers: { "x-goog-api-key": String(process.env.GEMINI_API_KEY), "content-type": "application/json" },
        body: JSON.stringify({
          contents: [{
            role: "user",
            parts: [
              { text: buildImageLocationPrompt(input.hints, input.products) },
              { inlineData: { mimeType: "image/jpeg", data: input.imageBase64 } },
              { inlineData: { mimeType: "image/jpeg", data: input.coordinateImageBase64 } }
            ]
          }],
          generationConfig: { responseMimeType: "application/json", maxOutputTokens: 8000, temperature: 0.1 }
        })
      });
      const outputText = geminiOutputText(payload);
      if (!outputText) throw new Error("Gemini görsel konum çıktısı bulunamadı.");
      return { ...parseImageLocationPayload(outputText, input.products, input.hints.imageCandidates ?? []), provider: "gemini", model };
    } catch (error) {
      errors.push(`${model}: ${safeErrorMessage(error)}`);
    }
  }
  throw new Error(`Gemini görsel konumlandırması başarısız. ${errors.join(" | ")}`);
}

function parseImageLocationPayload(
  raw: string,
  requestedProducts: Array<{ productKey: string; sku: string; name: string }>,
  imageCandidates: Array<{ index: number; region: CatalogImageRegion }>
): Omit<CatalogImageLocationResult, "provider" | "model"> {
  const parsed = parseJson(raw);
  const allowedKeys = new Set(requestedProducts.map((product) => product.productKey));
  const matches = Array.isArray(parsed.matches)
    ? parsed.matches
        .map((value) => {
          const record = asRecord(value);
          const productKey = clean(record.productKey);
          if (!allowedKeys.has(productKey)) return null;
          const imageCandidateIndex = nullableInteger(record.imageCandidateIndex);
          const selectedCandidate = imageCandidates.find((candidate) => candidate.index === imageCandidateIndex);
          return {
            productKey,
            imageCandidateIndex,
            imageRegion: selectedCandidate?.region ?? normalizeRegion(record.imageRegion)
          };
        })
        .filter((value): value is { productKey: string; imageCandidateIndex: number | null; imageRegion: CatalogImageRegion | null } => Boolean(value))
    : [];
  return { matches, warnings: stringArray(parsed.warnings) };
}

function buildImageLocationPrompt(hints: CatalogExtractionHints, products: Array<{ productKey: string; sku: string; name: string }>): string {
  const rows = products.map((product) => `${product.productKey} | SKU: ${product.sku} | Ürün: ${product.name}`).join("\n");
  const candidates = (hints.imageCandidates ?? [])
    .map((candidate) => `${candidate.index}: x=${candidate.region.x}, y=${candidate.region.y}, width=${candidate.region.width}, height=${candidate.region.height}`)
    .join("\n");
  return `Bu görev yalnızca ürün fotoğrafı konumlandırma görevidir.
Dosya: ${hints.fileName}, sayfa ${hints.pageNumber}/${hints.pageCount}.
Birinci görüntü temiz PDF sayfası, ikinci görüntü aynı sayfanın x/y 0-1000 ızgaralı kopyasıdır.

Her productKey için:
- Sayfada ürünü veya ait olduğu ürün ailesini gösteren gerçek fotoğraf/ürün renderı varsa ikinci görüntünün ızgarasına göre imageRegion ver.
- Kutuyu yalnızca ürün fotoğrafının dış sınırlarına çiz; başlık, fiyat tablosu, açıklama, komşu ürün, kullanım senaryosu ve sonraki bölüm kesinlikle kutuya girmesin.
- Aynı fotoğraf birden fazla renk/model varyantına aitse aynı koordinatı tekrar kullan.
- Sayfada TW/TWE veya QB60/QB60-E gibi ayrı model etiketli fotoğraflar varsa model kodunu etiketiyle eşleştir; ayrı fotoğraf varken genel aile fotoğrafını bütün modellere verme.
- Bir modelin ayrı etiketli fotoğrafı yoksa ancak aynı fiziksel tasarımı gösteren aile fotoğrafı açıkça geçerliyse o aile fotoğrafını paylaş.
- Sayfada bu ürüne ait fotoğraf yoksa imageRegion null bırak. Başka ürünü eşleştirme.
- Aşağıdaki gömülü görsel adaylarından biri doğru ürün fotoğrafıysa imageCandidateIndex alanına aday numarasını yaz ve imageRegion alanına o adayın koordinatlarını aynen kopyala.
- Grafik, tablo, fiyat sütunu, metin bloğu veya birden fazla ürün fotoğrafını kapsayan adayları seçme.
- Uygun gömülü aday yoksa imageCandidateIndex null bırak; yalnız bu durumda ızgaradan dar bir imageRegion ölç.
- productKey değerini aşağıdaki listeden karakteri karakterine kopyala ve her ürün için bir match döndür.

GÖMÜLÜ GÖRSEL ADAYLARI
${candidates || "Uygun gömülü görsel adayı yok."}

ÜRÜNLER
${rows}

Yalnızca geçerli JSON döndür: {"matches":[{"productKey":"product-1","imageCandidateIndex":0,"imageRegion":{"x":0,"y":0,"width":100,"height":100}}],"warnings":[]}.
Her ürün için bir match bulunmalı; aday veya fotoğraf yoksa imageCandidateIndex ve imageRegion null olmalı.`;
}

async function extractWithOpenAi(input: {
  imageBase64: string;
  coordinateImageBase64?: string;
  pageText: string;
  hints: CatalogExtractionHints;
}, options?: { completenessAuditProducts?: CatalogAiProductCandidate[] }): Promise<CatalogPageExtraction> {
  const model = clean(options?.completenessAuditProducts?.length ? process.env.OPENAI_CATALOG_AUDIT_MODEL : process.env.OPENAI_CATALOG_MODEL) || "gpt-5.4-mini";
  const payload = await fetchJsonWithRetry("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      model,
      store: false,
      max_output_tokens: catalogMaxOutputTokens(),
      input: [
        {
          role: "user",
          content: [
            { type: "input_text", text: buildPrompt(input.hints, input.pageText, options?.completenessAuditProducts) },
            { type: "input_image", image_url: `data:image/jpeg;base64,${input.imageBase64}`, detail: "high" },
            ...(input.coordinateImageBase64
              ? [{ type: "input_image", image_url: `data:image/jpeg;base64,${input.coordinateImageBase64}`, detail: "high" }]
              : [])
          ]
        }
      ],
      text: {
        format: {
          type: "json_schema",
          name: "catalog_page_extraction",
          strict: true,
          schema: CATALOG_PAGE_SCHEMA
        }
      }
    })
  });

  const outputText = openAiOutputText(payload);
  if (!outputText) {
    throw new Error("OpenAI yanıtında yapılandırılmış çıktı bulunamadı.");
  }

  return { ...parseCatalogPagePayload(outputText), provider: "openai", model };
}

async function extractWithGemini(input: {
  imageBase64: string;
  coordinateImageBase64?: string;
  pageText: string;
  hints: CatalogExtractionHints;
}): Promise<CatalogPageExtraction> {
  const errors: string[] = [];
  for (const model of geminiModelCandidates()) {
    try {
      const payload = await fetchJsonWithRetry(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
        method: "POST",
        headers: {
          "x-goog-api-key": String(process.env.GEMINI_API_KEY),
          "content-type": "application/json"
        },
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [
                { text: buildGeminiCatalogPrompt(input.hints, input.pageText) },
                { inlineData: { mimeType: "image/jpeg", data: input.imageBase64 } },
                ...(input.coordinateImageBase64 ? [{ inlineData: { mimeType: "image/jpeg", data: input.coordinateImageBase64 } }] : [])
              ]
            }
          ],
          generationConfig: {
            responseMimeType: "application/json",
            maxOutputTokens: catalogMaxOutputTokens(),
            temperature: 0.1
          }
        })
      });
      const outputText = geminiOutputText(payload);
      if (!outputText) throw new Error("Gemini yanıtında yapılandırılmış çıktı bulunamadı.");
      return { ...parseCatalogPagePayload(outputText), provider: "gemini", model };
    } catch (error) {
      errors.push(`${model}: ${safeErrorMessage(error)}`);
    }
  }
  throw new Error(`Gemini katalog çıkarımı başarısız. ${errors.join(" | ")}`);
}

export function parseCatalogPagePayload(raw: string | Record<string, unknown>): Omit<CatalogPageExtraction, "provider" | "model"> {
  const parsed = typeof raw === "string" ? parseJson(raw) : raw;
  const products = Array.isArray(parsed.products)
    ? parsed.products.map(normalizeProductCandidate).filter((product): product is CatalogAiProductCandidate => Boolean(product)).slice(0, 160)
    : [];

  return {
    pageBrand: nullableString(parsed.pageBrand),
    pageCategory: nullableString(parsed.pageCategory),
    pageCurrency: normalizeCurrency(nullableString(parsed.pageCurrency)),
    products,
    warnings: stringArray(parsed.warnings)
  };
}

export function qualifyGenericCatalogModelIdentities(
  extraction: CatalogPageExtraction,
  pageText: string
): CatalogPageExtraction {
  const collection = extractGenericModelCollection(pageText);
  if (!collection) return extraction;
  let qualifiedCount = 0;
  const products = extraction.products.map((product) => {
    const identity = clean(product.sku) || clean(product.manufacturerCode) || clean(product.sourceRecordId) || product.name;
    const model = genericModelLabel(identity) || genericModelLabel(product.name);
    if (!model) return product;
    const qualified = `${collection} ${model}`;
    qualifiedCount += 1;
    return {
      ...product,
      sourceRecordId: isGenericModelIdentity(product.sourceRecordId) ? qualified : product.sourceRecordId || qualified,
      sku: isGenericModelIdentity(product.sku) ? qualified : product.sku || qualified,
      manufacturerCode: isGenericModelIdentity(product.manufacturerCode) ? qualified : product.manufacturerCode,
      name: normalizeMatchValue(product.name).includes(normalizeMatchValue(collection)) ? product.name : `${collection} ${product.name}`,
      warnings: uniqueStrings([...product.warnings, `Genel model kodu sayfadaki "${collection}" seri/renk başlığıyla nitelendirildi.`])
    };
  });
  if (qualifiedCount === 0) return extraction;
  return {
    ...extraction,
    products,
    warnings: uniqueStrings([...extraction.warnings, `${qualifiedCount} genel model koduna "${collection}" seri/renk başlığı eklendi.`])
  };
}

export function normalizeFloorpanCatalogProducts(
  extraction: CatalogPageExtraction,
  sourceName: string
): CatalogPageExtraction {
  if (!/floorpan/i.test(sourceName)) return extraction;

  let discardedCount = 0;
  const products = extraction.products.flatMap((product) => {
    const code = canonicalFloorpanModelCode(
      product.sku,
      product.manufacturerCode,
      product.sourceRecordId,
      product.name
    );
    if (!code) {
      discardedCount += 1;
      return [];
    }

    return [{
      ...product,
      sourceRecordId: code,
      sku: code,
      manufacturerCode: code,
      warnings: uniqueStrings([
        ...product.warnings,
        `Floorpan dekor kimliği ${code} olarak kanonikleştirildi.`
      ])
    }];
  });

  return {
    ...extraction,
    products,
    warnings: uniqueStrings([
      ...extraction.warnings,
      ...(discardedCount > 0
        ? [`${discardedCount} kodsuz görsel, açıklama veya OCR kaydı Floorpan ürün listesinden çıkarıldı.`]
        : [])
    ])
  };
}

export function canonicalFloorpanModelCode(...values: Array<string | null | undefined>): string {
  const text = values
    .map((value) => clean(value))
    .filter(Boolean)
    .join(" ")
    .toLocaleUpperCase("tr-TR");
  const match = text.match(/\b(FSX|FS|FT)\s*[-_]?\s*0*(\d{1,3})\b/i);
  if (!match?.[1] || !match[2]) return "";
  const number = Number(match[2]);
  if (!Number.isInteger(number) || number <= 0) return "";
  const prefix = match[1].toUpperCase();
  return `${prefix}${String(number).padStart(prefix === "FSX" ? 2 : 3, "0")}`;
}

const lamindoorCollections = [
  { canonical: "SARUHAN", aliases: ["SARUHAN"] },
  { canonical: "AYDER", aliases: ["AYDER"] },
  { canonical: "GAZEZ CEVIZ", aliases: ["GAZEZ CEVIZ"] },
  { canonical: "ABD CEVIZ", aliases: ["ABD CEVIZ"] },
  { canonical: "HAZAR", aliases: ["HAZAR"] },
  { canonical: "OZIGO", aliases: ["OZIGO"] },
  { canonical: "YENICE MESE", aliases: ["YENICE MESE"] },
  { canonical: "ANTRASIT", aliases: ["ANTRASIT", "ANTRASIL"] }
] as const;

export function extractStructuredLamindoorPage(
  pageText: string,
  sourceName: string,
  pageNumber = 0
): CatalogPageExtraction | null {
  if (!/lamindoor/i.test(sourceName)) return null;
  if (pageNumber === 4 || pageNumber === 26) {
    return structuredLamindoorExtraction([], "Model özeti veya teknik panel seçenekleri sayfası; ayrı satılabilir ürün değildir.");
  }

  const gzzProducts = new Map<string, CatalogAiProductCandidate>();
  const surface = lamindoorGzzSurfaceFromText(pageText);
  for (const rawLine of pageText.split(/\r?\n/)) {
    const matches = Array.from(rawLine.matchAll(/\bGZZ\s*(\d{3,4})\b/gi));
    for (const match of matches) {
      if (!match[1]) continue;
      const codeNumber = Number(match[1]);
      const code = `GZZ ${codeNumber}`;
      const identity = codeNumber < 1000 && surface ? `${code} - ${surface.canonical}` : code;
      const descriptor = matches.length === 1
        ? clean(rawLine.replace(match[0], "").replace(/\s+/g, " "))
        : "";
      const name = codeNumber < 1000 && surface
        ? `${code} ${surface.label}`
        : descriptor
          ? `${code} ${descriptor}`
          : code;
      gzzProducts.set(identity, structuredLamindoorCandidate(identity, name, lamindoorPanelSpecs(pageText)));
    }
  }
  if (gzzProducts.size > 0) {
    const products = assignLamindoorImageRegions(Array.from(gzzProducts.values()), pageNumber);
    return structuredLamindoorExtraction(
      products,
      `${gzzProducts.size} GZZ kodu PDF metin katmanından doğrulandı.`
    );
  }

  const collection = lamindoorCollectionFromText(pageText);
  const modelNumbers = uniqueStrings(
    Array.from(pageText.matchAll(/\bMODEL\s*0*(\d{1,2})\b/gi), (match) => match[1])
  ).sort((left, right) => Number(left) - Number(right));
  if (!collection || modelNumbers.length === 0) return null;

  const specs = /2100\s*-\s*2400|PANEL\s+(?:ÖLÇÜLERİ|DIMENSIONS)/i.test(pageText)
    ? [
        { label: "Boy", value: "2100-2400 mm" },
        { label: "Genişlik", value: "910 mm" },
        { label: "Kalınlık", value: "4-6-8-10 mm" }
      ]
    : [];
  return structuredLamindoorExtraction(
    assignLamindoorImageRegions(modelNumbers.map((modelNumber) => {
      const identity = `${collection} MODEL ${Number(modelNumber)}`;
      return structuredLamindoorCandidate(identity, identity, specs);
    }), pageNumber),
    `${collection} serisindeki ${modelNumbers.length} model kodu PDF metin katmanından doğrulandı.`
  );
}

export function normalizeLamindoorCatalogProducts(
  extraction: CatalogPageExtraction,
  sourceName: string
): CatalogPageExtraction {
  if (!/lamindoor/i.test(sourceName)) return extraction;

  let discardedCount = 0;
  const products = extraction.products.flatMap((product) => {
    const identity = canonicalLamindoorProductIdentity(
      product.sku,
      product.manufacturerCode,
      product.sourceRecordId,
      product.name
    );
    if (!identity) {
      discardedCount += 1;
      return [];
    }
    return [{
      ...product,
      sourceRecordId: identity,
      sku: identity,
      manufacturerCode: identity,
      name: identity.includes(" MODEL ")
        ? identity
        : identity.includes(" - ")
          ? identity.replace(" - ", " ")
          : lamindoorGzzProductName(identity, product.name),
      warnings: uniqueStrings([
        ...product.warnings,
        `Lamindoor ürün kimliği ${identity} olarak kanonikleştirildi.`
      ])
    }];
  });

  return {
    ...extraction,
    products,
    warnings: uniqueStrings([
      ...extraction.warnings,
      ...(discardedCount > 0
        ? [`${discardedCount} doğrulanmamış OCR kaydı Lamindoor ürün listesinden çıkarıldı.`]
        : [])
    ])
  };
}

export function canonicalLamindoorProductIdentity(...values: Array<string | null | undefined>): string {
  const raw = values.map((value) => clean(value)).filter(Boolean).join(" ");
  const gzz = raw.match(/\bGZZ\s*[-_]?\s*0*(\d{3,4})\b/i);
  if (gzz?.[1]) {
    const codeNumber = Number(gzz[1]);
    const surface = codeNumber < 1000 ? lamindoorGzzSurfaceFromText(raw) : null;
    return `GZZ ${codeNumber}${surface ? ` - ${surface.canonical}` : ""}`;
  }

  const folded = foldTurkish(raw);
  const model = folded.match(/\bMODEL\s*[-_]?\s*0*(\d{1,2})\b/i);
  if (!model?.[1]) return "";
  const collection = lamindoorCollections.find((entry) =>
    entry.aliases.some((alias) => new RegExp(`\\b${alias.replace(/\s+/g, "\\s+")}\\b`, "i").test(folded))
  );
  return collection ? `${collection.canonical} MODEL ${Number(model[1])}` : "";
}

function structuredLamindoorExtraction(products: CatalogAiProductCandidate[], warning: string): CatalogPageExtraction {
  return {
    provider: "text_fallback",
    model: "lamindoor-structured-v1",
    pageBrand: "LAMINDOOR",
    pageCategory: "İç kapı ve kapı paneli",
    pageCurrency: "TRY",
    products,
    warnings: [warning, "Basılı ürün kodları kaynak PDF metniyle deterministik olarak eşleştirildi."]
  };
}

function structuredLamindoorCandidate(
  identity: string,
  name: string,
  technicalSpecs: Array<{ label: string; value: string }> = []
): CatalogAiProductCandidate {
  return {
    sourceRecordId: identity,
    sku: identity,
    barcode: null,
    manufacturerCode: identity,
    name,
    brand: "LAMINDOOR",
    category: "İç kapı ve kapı paneli",
    description: null,
    listPrice: null,
    currency: "TRY",
    taxRate: null,
    unitType: "Adet",
    stockQuantity: null,
    stockStatus: "unknown",
    minOrder: 1,
    packageQuantity: null,
    cartonQuantity: null,
    palletQuantity: null,
    warrantyMonths: null,
    technicalSpecs,
    imageCandidateIndex: null,
    imageRegion: null,
    confidence: 98,
    warnings: ["Ürün kodu PDF metin katmanında açıkça doğrulandı."]
  };
}

function assignLamindoorImageRegions(
  products: CatalogAiProductCandidate[],
  pageNumber: number
): CatalogAiProductCandidate[] {
  const regions = lamindoorPageImageRegions(products, pageNumber);
  return products.map((product, index) => ({
    ...product,
    imageRegion: regions[index] ?? null
  }));
}

function lamindoorPageImageRegions(products: CatalogAiProductCandidate[], pageNumber: number): CatalogImageRegion[] {
  const productCount = products.length;
  const gzzProducts = products.every((product) => /^GZZ\s+\d+/i.test(clean(product.sku)));
  if (productCount === 1) {
    return [gzzProducts
      ? { x: 190, y: 65, width: 505, height: 730 }
      : { x: 315, y: 70, width: 500, height: 715 }];
  }
  if (productCount === 2) {
    const upperLeft = { x: 185, y: 95, width: 375, height: 550 };
    const lowerRight = { x: 575, y: 205, width: 365, height: 545 };
    const upperRight = { x: 440, y: 95, width: 370, height: 550 };
    const lowerLeft = { x: 55, y: 205, width: 370, height: 545 };
    return pageNumber % 2 === 1 ? [upperRight, lowerLeft] : [upperLeft, lowerRight];
  }
  if (productCount === 3 && gzzProducts) {
    const byEnding: Record<string, CatalogImageRegion> = {
      "1": { x: 190, y: 70, width: 405, height: 600 },
      "2": { x: 675, y: 70, width: 250, height: 355 },
      "3": { x: 675, y: 430, width: 250, height: 355 }
    };
    return products.map((product) => {
      const code = clean(product.sku).match(/GZZ\s+(\d+)/i)?.[1] ?? "";
      return byEnding[code.slice(-1)] ?? { x: 190, y: 70, width: 405, height: 600 };
    });
  }
  if (productCount === 6) {
    return [
      { x: 65, y: 80, width: 240, height: 390 },
      { x: 315, y: 80, width: 240, height: 390 },
      { x: 565, y: 80, width: 240, height: 390 },
      { x: 65, y: 510, width: 240, height: 385 },
      { x: 315, y: 510, width: 240, height: 385 },
      { x: 565, y: 510, width: 240, height: 385 }
    ];
  }
  return [];
}

function lamindoorPanelSpecs(pageText: string): Array<{ label: string; value: string }> {
  return /2100\s*-\s*2400|PANEL\s+(?:ÖLÇÜLERİ|DIMENSIONS)/i.test(pageText)
    ? [
        { label: "Boy", value: "2100-2400 mm" },
        { label: "Genişlik", value: "910 mm" },
        { label: "Kalınlık", value: "4-6-8-10 mm" }
      ]
    : [];
}

function lamindoorGzzSurfaceFromText(value: string): { canonical: string; label: string } | null {
  const folded = foldTurkish(value);
  const surfaces = [
    { canonical: "TOPKAPI", label: "Topkapı" },
    { canonical: "BEYAZ", label: "Beyaz" },
    { canonical: "GRI MESE", label: "Gri Meşe" },
    { canonical: "VIZON", label: "Vizon" },
    { canonical: "SARUHAN", label: "Saruhan" }
  ];
  return surfaces.find((surface) => new RegExp(`\\b${surface.canonical.replace(/\s+/g, "\\s+")}\\b`, "i").test(folded)) ?? null;
}

function lamindoorCollectionFromText(value: string): string {
  const folded = foldTurkish(value);
  return lamindoorCollections.find((entry) =>
    entry.aliases.some((alias) => new RegExp(`\\b${alias.replace(/\s+/g, "\\s+")}\\b`, "i").test(folded))
  )?.canonical ?? "";
}

function lamindoorGzzProductName(identity: string, value: string): string {
  const descriptor = clean(value).replace(/\bGZZ\s*[-_]?\s*0*\d{3,4}\b/gi, "").trim();
  return descriptor ? `${identity} ${descriptor}` : identity;
}

function foldTurkish(value: string): string {
  return clean(value)
    .toLocaleUpperCase("tr-TR")
    .replace(/[İI]/g, "I")
    .replace(/Ç/g, "C")
    .replace(/Ğ/g, "G")
    .replace(/Ö/g, "O")
    .replace(/Ş/g, "S")
    .replace(/Ü/g, "U");
}

function extractGenericModelCollection(pageText: string): string {
  const cleaned = pageText
    .replace(/https?:\/\/\S+|(?:www\.)?\S+\.(?:com|com\.tr|net|org)\S*/gi, " ")
    .replace(/\bMODEL\s*\d+[A-Z]?\b/gi, " ")
    .replace(/(?:Isıya|Çizilmeye)\s+Dayanıklı|Solmaz\s+Renkler|Hızlı\s+Montaj/gi, " ")
    .replace(/PANEL\s+(?:ÖLÇÜLERİ|DIMENSIONS)|Boy\s*\/\s*Length|Genişlik\s*\/\s*Width|Kalınlık\s*\/\s*Thickness/gi, " ")
    .replace(/\b\d+(?:[.,-]\d+)*\s*(?:mm|cm)?\b/gi, " ");
  const ignored = new Set(["LAMINDOOR", "PANEL", "PANELS", "RENK", "RENKLER", "MONTAJ", "DAYANIKLI"]);
  for (const rawLine of cleaned.split(/\r?\n/)) {
    const line = rawLine.replace(/[^\p{L}\s-]+/gu, " ").replace(/\s+/g, " ").trim();
    if (!line || line.length < 3 || line.length > 45) continue;
    const words = line.split(" ").filter(Boolean);
    if (words.length > 4 || words.every((word) => ignored.has(word.toLocaleUpperCase("tr-TR")))) continue;
    return line;
  }
  return "";
}

function genericModelLabel(value: string): string {
  const match = clean(value).match(/^MODEL\s*0*(\d+[A-Z]?)$/i);
  return match?.[1] ? `MODEL ${match[1].toLocaleUpperCase("tr-TR")}` : "";
}

function isGenericModelIdentity(value: string | null): boolean {
  return Boolean(value && genericModelLabel(value));
}

function bestCandidateMatch(
  source: CatalogAiProductCandidate,
  candidates: CatalogAiProductCandidate[],
  availableIndexes: Set<number>
): number | null {
  let bestIndex: number | null = null;
  let bestScore = 0;
  for (const index of availableIndexes) {
    const score = candidateMatchScore(source, candidates[index]!);
    if (score > bestScore) {
      bestIndex = index;
      bestScore = score;
    }
  }
  return bestScore >= 90 ? bestIndex : null;
}

function candidateMatchScore(left: CatalogAiProductCandidate, right: CatalogAiProductCandidate): number {
  const leftIdentifiers = candidateIdentifiers(left);
  const rightIdentifiers = candidateIdentifiers(right);
  if (leftIdentifiers.some((value) => rightIdentifiers.includes(value))) return 130;

  const leftName = normalizeMatchValue(left.name);
  const rightName = normalizeMatchValue(right.name);
  if (leftIdentifiers.some((value) => value.length >= 4 && rightName.includes(value))) return 120;
  if (rightIdentifiers.some((value) => value.length >= 4 && leftName.includes(value))) return 120;
  if (isDroppedSinglePhaseMarkerMatch(left, right)) return 105;
  if (leftName && leftName === rightName && (leftIdentifiers.length === 0 || rightIdentifiers.length === 0)) return 110;

  const similarity = tokenSimilarity(left.name, right.name);
  return similarity >= 0.92 && sharedModelToken(left.name, right.name) ? 95 : 0;
}

function candidateIdentifiers(product: CatalogAiProductCandidate): string[] {
  const normalized = [product.sku, product.manufacturerCode, product.sourceRecordId]
    .map((value) => normalizeMatchValue(value ?? ""))
    .filter((value) => value.length >= 3);
  return uniqueStrings([...normalized, ...normalized.map(normalizeCommercialVariantIdentity)]);
}

function shouldRunCompletenessAudit(openAi: CatalogPageExtraction, gemini: CatalogPageExtraction): boolean {
  if (process.env.CATALOG_COMPLETENESS_AUDIT === "false") return false;
  const openAiCount = openAi.products.length;
  const geminiCount = gemini.products.length;
  return openAiCount >= 12 && openAiCount - geminiCount >= 8 && geminiCount / openAiCount < 0.6;
}

function mergeSameProviderPasses(primary: CatalogPageExtraction, audit: CatalogPageExtraction): CatalogPageExtraction {
  const unusedAudit = new Set(audit.products.map((_, index) => index));
  const products: CatalogAiProductCandidate[] = [];
  let auditAdditions = 0;

  for (const product of primary.products) {
    const match = bestCandidateMatch(product, audit.products, unusedAudit);
    if (match === null) {
      products.push(product);
      continue;
    }
    unusedAudit.delete(match);
    products.push(mergeProductCandidates(product, audit.products[match]!).product);
  }

  for (const index of unusedAudit) {
    const product = audit.products[index]!;
    if (!isSubstantiatedSingleProviderProduct(product)) continue;
    products.push(product);
    auditAdditions += 1;
  }

  return {
    ...primary,
    model: `${primary.model}+completeness:${audit.model}`,
    pageBrand: preferredText(primary.pageBrand, audit.pageBrand),
    pageCategory: preferredText(primary.pageCategory, audit.pageCategory),
    pageCurrency: preferredText(primary.pageCurrency, audit.pageCurrency),
    products,
    warnings: uniqueStrings([
      ...primary.warnings,
      ...audit.warnings.map((warning) => `OpenAI tamlık denetimi: ${warning}`),
      `OpenAI tamlık denetimi ${primary.products.length} ilk kaydı yeniden saydı ve ${auditAdditions} ek model satırı buldu.`
    ])
  };
}

function mergeProductCandidates(
  openAi: CatalogAiProductCandidate,
  gemini: CatalogAiProductCandidate
): { product: CatalogAiProductCandidate; conflictCount: number } {
  const preferred = openAi.confidence >= gemini.confidence ? openAi : gemini;
  const alternate = preferred === openAi ? gemini : openAi;
  const conflicts: string[] = [];
  const warnTextConflict = (label: string, left: string | null, right: string | null): void => {
    if (left && right && normalizeMatchValue(left) !== normalizeMatchValue(right)) conflicts.push(`${label}: "${left}" / "${right}"`);
  };
  const warnNumberConflict = (label: string, left: number | null, right: number | null): void => {
    if (left !== null && right !== null && Math.abs(left - right) > 0.0001) conflicts.push(`${label}: ${left} / ${right}`);
  };

  warnTextConflict("SKU", openAi.sku, gemini.sku);
  warnTextConflict("üretici kodu", openAi.manufacturerCode, gemini.manufacturerCode);
  warnTextConflict("barkod", openAi.barcode, gemini.barcode);
  warnTextConflict("para birimi", openAi.currency, gemini.currency);
  warnNumberConflict("fiyat", openAi.listPrice, gemini.listPrice);
  warnNumberConflict("stok", openAi.stockQuantity, gemini.stockQuantity);
  warnNumberConflict("paket", openAi.packageQuantity, gemini.packageQuantity);
  warnNumberConflict("koli", openAi.cartonQuantity, gemini.cartonQuantity);
  warnNumberConflict("palet", openAi.palletQuantity, gemini.palletQuantity);
  if (
    openAi.stockStatus !== "unknown" &&
    gemini.stockStatus !== "unknown" &&
    openAi.stockStatus !== gemini.stockStatus
  ) {
    conflicts.push(`stok durumu: ${openAi.stockStatus} / ${gemini.stockStatus}`);
  }
  if (openAi.imageRegion && gemini.imageRegion && !regionsAgree(openAi.imageRegion, gemini.imageRegion)) {
    conflicts.push("ürün görsel bölgesi farklı bulundu");
  }

  const technicalSpecs = mergeTechnicalSpecs(openAi.technicalSpecs, gemini.technicalSpecs);
  const phaseAwareSku = preferredSinglePhaseIdentifier(openAi, gemini, openAi.sku, gemini.sku);
  const reportedConfidences = [openAi.confidence, gemini.confidence].filter((value) => value > 0);
  const confidenceBase = reportedConfidences.length > 1
    ? reportedConfidences.reduce((sum, value) => sum + value, 0) / reportedConfidences.length
    : Math.max(0, (reportedConfidences[0] ?? 0) - 5);
  const product: CatalogAiProductCandidate = {
    sourceRecordId: preferredText(preferred.sourceRecordId, alternate.sourceRecordId),
    sku: phaseAwareSku ?? preferredText(preferred.sku, alternate.sku),
    barcode: preferredText(preferred.barcode, alternate.barcode),
    manufacturerCode: preferredText(preferred.manufacturerCode, alternate.manufacturerCode),
    name: richerProductName(preferred.name, alternate.name),
    brand: preferredText(preferred.brand, alternate.brand),
    category: preferredText(preferred.category, alternate.category),
    description: richerText(preferred.description, alternate.description),
    listPrice: preferredNumber(preferred.listPrice, alternate.listPrice),
    currency: preferredText(preferred.currency, alternate.currency),
    taxRate: preferredNumber(preferred.taxRate, alternate.taxRate),
    unitType: preferredText(preferred.unitType, alternate.unitType),
    stockQuantity: preferredNumber(preferred.stockQuantity, alternate.stockQuantity),
    stockStatus: preferred.stockStatus !== "unknown" ? preferred.stockStatus : alternate.stockStatus,
    minOrder: preferredNumber(preferred.minOrder, alternate.minOrder),
    packageQuantity: preferredNumber(preferred.packageQuantity, alternate.packageQuantity),
    cartonQuantity: preferredNumber(preferred.cartonQuantity, alternate.cartonQuantity),
    palletQuantity: preferredNumber(preferred.palletQuantity, alternate.palletQuantity),
    warrantyMonths: preferredNumber(preferred.warrantyMonths, alternate.warrantyMonths),
    technicalSpecs,
    imageCandidateIndex: preferred.imageCandidateIndex ?? alternate.imageCandidateIndex,
    imageRegion: preferred.imageRegion ?? alternate.imageRegion,
    confidence: clamp(Math.round(confidenceBase) + 3 - conflicts.length * 4, 0, 100),
    warnings: uniqueStrings([
      ...openAi.warnings,
      ...gemini.warnings,
      ...(conflicts.length ? [`OpenAI/Gemini doğrulama farkı: ${conflicts.join("; ")}`] : [])
    ])
  };
  return { product, conflictCount: conflicts.length };
}

function singleProviderCandidate(product: CatalogAiProductCandidate, providerLabel: "OpenAI" | "Gemini"): CatalogAiProductCandidate {
  return {
    ...product,
    confidence: clamp(product.confidence - 12, 0, 100),
    warnings: uniqueStrings([
      ...product.warnings,
      `Bu ürün satırını yalnızca ${providerLabel} buldu; ikinci AI doğrulaması ve admin kontrolü gerekli.`
    ])
  };
}

function isSubstantiatedSingleProviderProduct(product: CatalogAiProductCandidate): boolean {
  if (isAggregateFamilyHeading(product)) return false;
  const hasIdentity = [product.sku, product.manufacturerCode, product.sourceRecordId, product.barcode]
    .some((value) => normalizeMatchValue(value ?? "").length >= 3);
  const hasCommercialData = product.listPrice !== null || product.stockQuantity !== null;
  const hasTechnicalEvidence = product.technicalSpecs.length >= 2;
  const modelLikeName = /\d/.test(product.name) && product.technicalSpecs.length > 0;
  return hasIdentity || hasCommercialData || hasTechnicalEvidence || modelLikeName;
}

function isAggregateFamilyHeading(product: CatalogAiProductCandidate): boolean {
  const identity = clean(product.sku) || clean(product.manufacturerCode) || clean(product.sourceRecordId);
  return product.technicalSpecs.length <= 1 && product.listPrice === null && /^[A-Z0-9()]+(?:-\d+){3,}$/i.test(identity);
}

function normalizeCommercialVariantIdentity(value: string): string {
  if (/^\d/.test(value) && /(?:220|380)[WV]$/.test(value)) {
    return value.replace(/KW/g, "").replace(/V$/, "W");
  }
  return value;
}

function isDroppedSinglePhaseMarkerMatch(left: CatalogAiProductCandidate, right: CatalogAiProductCandidate): boolean {
  const leftIdentity = primaryIdentifier(left);
  const rightIdentity = primaryIdentifier(right);
  if (!identifiersDifferOnlyByPhaseMarker(leftIdentity, rightIdentity)) return false;
  const leftVoltage = explicitPhaseVoltage(left);
  const rightVoltage = explicitPhaseVoltage(right);
  if (leftVoltage === null || leftVoltage !== rightVoltage) return false;
  return matchingTechnicalSpecCount(left.technicalSpecs, right.technicalSpecs) >= 2;
}

function preferredSinglePhaseIdentifier(
  left: CatalogAiProductCandidate,
  right: CatalogAiProductCandidate,
  leftValue: string | null,
  rightValue: string | null
): string | null {
  if (!leftValue || !rightValue || !isDroppedSinglePhaseMarkerMatch(left, right)) return null;
  const voltage = explicitPhaseVoltage(left);
  const leftHasMarker = hasSinglePhaseMarker(leftValue);
  const rightHasMarker = hasSinglePhaseMarker(rightValue);
  if (leftHasMarker === rightHasMarker) return null;
  if (voltage === 220) return leftHasMarker ? leftValue : rightValue;
  if (voltage === 380) return leftHasMarker ? rightValue : leftValue;
  return null;
}

function primaryIdentifier(product: CatalogAiProductCandidate): string {
  return clean(product.sku) || clean(product.manufacturerCode) || clean(product.sourceRecordId);
}

function identifiersDifferOnlyByPhaseMarker(left: string, right: string): boolean {
  const normalizedLeft = normalizeMatchValue(left);
  const normalizedRight = normalizeMatchValue(right);
  if (!normalizedLeft || !normalizedRight || normalizedLeft === normalizedRight) return false;
  const leftWithoutMarker = normalizedLeft.replace(/M(?=\d)/g, "");
  const rightWithoutMarker = normalizedRight.replace(/M(?=\d)/g, "");
  return leftWithoutMarker === rightWithoutMarker && Math.abs(normalizedLeft.length - normalizedRight.length) === 1;
}

function hasSinglePhaseMarker(value: string): boolean {
  return /M(?=\d)/.test(normalizeMatchValue(value));
}

function explicitPhaseVoltage(product: CatalogAiProductCandidate): 220 | 380 | null {
  const evidence = [
    product.name,
    product.description ?? "",
    ...product.technicalSpecs.flatMap((spec) => [spec.label, spec.value])
  ].join(" ");
  const has220 = /(?:^|\D)220\s*V?(?:\D|$)/i.test(evidence);
  const has380 = /(?:^|\D)380\s*V?(?:\D|$)/i.test(evidence);
  if (has220 === has380) return null;
  return has220 ? 220 : 380;
}

function matchingTechnicalSpecCount(
  left: Array<{ label: string; value: string }>,
  right: Array<{ label: string; value: string }>
): number {
  const rightKeys = new Set(right.map(semanticSpecKey));
  return new Set(left.map(semanticSpecKey).filter((key) => rightKeys.has(key))).size;
}

function mergePageMetadataWarnings(openAi: CatalogPageExtraction, gemini: CatalogPageExtraction): string[] {
  const warnings: string[] = [];
  const compare = (label: string, left: string | null, right: string | null): void => {
    if (left && right && normalizeMatchValue(left) !== normalizeMatchValue(right)) {
      warnings.push(`Sayfa ${label} bilgisi sağlayıcılar arasında farklı: "${left}" / "${right}".`);
    }
  };
  compare("marka", openAi.pageBrand, gemini.pageBrand);
  compare("kategori", openAi.pageCategory, gemini.pageCategory);
  compare("para birimi", openAi.pageCurrency, gemini.pageCurrency);
  return warnings;
}

function mergeTechnicalSpecs(
  first: Array<{ label: string; value: string }>,
  second: Array<{ label: string; value: string }>
): Array<{ label: string; value: string }> {
  const seen = new Set<string>();
  const result: Array<{ label: string; value: string }> = [];
  for (const spec of [...first, ...second]) {
    const key = semanticSpecKey(spec);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(spec);
  }
  return result.slice(0, 80);
}

function semanticSpecKey(spec: { label: string; value: string }): string {
  let label = normalizeMatchValue(spec.label)
    .replace(/Ç/g, "C")
    .replace(/Ğ/g, "G")
    .replace(/Ö/g, "O")
    .replace(/Ş/g, "S")
    .replace(/Ü/g, "U");
  let value = normalizeMatchValue(spec.value.replace(/³/g, "3").replace(/²/g, "2").replace(/½/g, " 1/2"));
  if (label === "GUC" && /KW/.test(value)) label = "GUCKW";
  if (["HP", "GUCHP"].includes(label)) label = "GUCHP";
  if (label === "MAXAKIS") label = "MAXAKIS";
  if (label === "GIRISCIKIS") label = "GIRISCIKIS";
  if (label === "GUCKW") value = value.replace(/KW/g, "");
  if (label === "GUCHP") value = value.replace(/HP/g, "");
  return `${label}:${value}`;
}

function regionsAgree(left: CatalogImageRegion, right: CatalogImageRegion): boolean {
  const leftCenter = { x: left.x + left.width / 2, y: left.y + left.height / 2 };
  const rightCenter = { x: right.x + right.width / 2, y: right.y + right.height / 2 };
  const centerDistance = Math.hypot(leftCenter.x - rightCenter.x, leftCenter.y - rightCenter.y);
  return centerDistance <= Math.max(90, Math.min(left.width, left.height, right.width, right.height) * 0.55);
}

function richerProductName(preferred: string, alternate: string): string {
  if (normalizeMatchValue(preferred) === normalizeMatchValue(alternate)) return preferred.length >= alternate.length ? preferred : alternate;
  return preferred;
}

function richerText(preferred: string | null, alternate: string | null): string | null {
  if (!preferred) return alternate;
  if (!alternate) return preferred;
  return alternate.length > preferred.length * 1.15 ? alternate : preferred;
}

function preferredText(preferred: string | null, alternate: string | null): string | null {
  return preferred || alternate || null;
}

function preferredNumber(preferred: number | null, alternate: number | null): number | null {
  return preferred ?? alternate ?? null;
}

function tokenSimilarity(left: string, right: string): number {
  const leftTokens = new Set(matchTokens(left));
  const rightTokens = new Set(matchTokens(right));
  const union = new Set([...leftTokens, ...rightTokens]);
  if (union.size === 0) return 0;
  const intersection = [...leftTokens].filter((token) => rightTokens.has(token)).length;
  return intersection / union.size;
}

function sharedModelToken(left: string, right: string): boolean {
  const leftTokens = new Set(matchTokens(left).filter((token) => /\d/.test(token) && token.length >= 3));
  return matchTokens(right).some((token) => leftTokens.has(token));
}

function matchTokens(value: string): string[] {
  return value
    .toLocaleUpperCase("tr-TR")
    .replace(/İ/g, "I")
    .split(/[^A-Z0-9ÇĞÖŞÜ]+/)
    .filter((token) => token.length >= 2);
}

function normalizeMatchValue(value: string): string {
  return value
    .toLocaleUpperCase("tr-TR")
    .replace(/İ/g, "I")
    .replace(/[^A-Z0-9ÇĞÖŞÜ]+/g, "");
}

function normalizeProductCandidate(value: unknown): CatalogAiProductCandidate | null {
  const row = asRecord(value);
  const name = clean(row.name);
  if (!name) {
    return null;
  }

  const stockStatus = clean(row.stockStatus);
  return {
    sourceRecordId: nullableString(row.sourceRecordId),
    sku: nullableString(row.sku),
    barcode: nullableString(row.barcode),
    manufacturerCode: nullableString(row.manufacturerCode),
    name,
    brand: nullableString(row.brand),
    category: nullableString(row.category),
    description: nullableString(row.description),
    listPrice: nullableNumber(row.listPrice),
    currency: normalizeCurrency(nullableString(row.currency)),
    taxRate: nullableNumber(row.taxRate),
    unitType: nullableString(row.unitType),
    stockQuantity: nullableNumber(row.stockQuantity),
    stockStatus: isStockStatus(stockStatus) ? stockStatus : "unknown",
    minOrder: nullableNumber(row.minOrder),
    packageQuantity: nullableNumber(row.packageQuantity),
    cartonQuantity: nullableNumber(row.cartonQuantity),
    palletQuantity: nullableNumber(row.palletQuantity),
    warrantyMonths: nullableNumber(row.warrantyMonths),
    technicalSpecs: normalizeSpecs(row.technicalSpecs),
    imageCandidateIndex: nullableInteger(row.imageCandidateIndex),
    imageRegion: normalizeRegion(row.imageRegion),
    confidence: clamp(nullableNumber(row.confidence) ?? 0, 0, 100),
    warnings: stringArray(row.warnings)
  };
}

function buildPrompt(
  hints: CatalogExtractionHints,
  pageText: string,
  completenessAuditProducts?: CatalogAiProductCandidate[]
): string {
  const text = pageText.slice(0, 45_000);
  const imageCandidates = (hints.imageCandidates ?? [])
    .map((candidate) => `${candidate.index}: x=${candidate.region.x}, y=${candidate.region.y}, width=${candidate.region.width}, height=${candidate.region.height}`)
    .join("\n");
  const auditIdentities = (completenessAuditProducts ?? [])
    .map((product) => clean(product.sku) || clean(product.manufacturerCode) || clean(product.sourceRecordId) || product.name)
    .filter(Boolean);
  const ocrModelCandidates = uniqueStrings(hints.ocrModelCandidates ?? []).slice(0, 180);
  const completenessIdentities = uniqueStrings([...auditIdentities, ...ocrModelCandidates]);
  const auditInstructions = auditIdentities.length
    ? `\nTAMLIK DENETİMİ - İKİNCİ BAĞIMSIZ OKUMA\nİlk AI okuması ve bağımsız OCR taramasından gelen model kimlikleri:\n${completenessIdentities.join(", ")}\n- Çıktıda yalnız eksikleri değil, sayfanın eksiksiz ve düzeltilmiş TÜM ürün kayıtlarını döndür.\n- Her teknik tablonun her satırını yukarıdan aşağıya say; her satırdaki tek-faz ve üç-faz model hücrelerini ayrı ayrı kontrol et. Tire/boş hücre ürün değildir.\n- İlk listede görünmeyen model hücrelerini özellikle ara. Bir kod ilk listede olsa bile görüntüden tekrar doğrula.\n- OCR adayları hatalı karakter içerebilir; görüntüdeki model hücresinden düzelt. Görüntüde doğrulanmayan OCR adayını ürün yapma.\n- Grafik eğrisi üzerindeki model etiketlerini, aynı sayfada açık bir satılabilir tablo satırı yoksa ürün olarak çıkarma.\n`
    : "";
  const ocrInstructions = ocrModelCandidates.length
    ? `\nBAĞIMSIZ OCR MODEL ADAYLARI (gürültülü olabilir):\n${ocrModelCandidates.join(", ")}\nBu listeyi yalnız tamlık kontrolü için kullan; her adayı görüntüde doğrula ve OCR karakter hatalarını düzelt. Görüntüde gerçek model hücresi olan hiçbir adayı atlama.\n`
    : "";
  return `Sen endüstriyel ürün kataloglarını yüksek doğrulukla yapılandıran bir veri uzmanısın.

Dosya: ${hints.fileName}
Kaynak: ${hints.sourceName}
Sayfa: ${hints.pageNumber}/${hints.pageCount}
Marka ipucu: ${hints.brandHint || "yok"}
Kategori ipucu: ${hints.categoryHint || "yok"}
Varsayılan para birimi: ${hints.defaultCurrency || "TRY"}
${auditInstructions}
${ocrInstructions}

GÖREV
- Birinci görüntü temiz sayfadır. İkinci görüntü verilmişse aynı sayfanın x/y 0-1000 koordinat ızgaralı kopyasıdır; imageRegion değerini mutlaka ikinci görüntüdeki çizgi ve etiketlere göre ölç.
- Sayfadaki her SATILABİLİR ürün veya model varyantını ayrı kayıt çıkar. Teknik tabloda farklı model/SKU satırları varsa her satır ayrı üründür.
- Aynı ürün satırında ayrı fiyat verilen renk, kaplama, katman, baz, ambalaj, hacim veya ölçü sütunları bağımsız sipariş edilebilir varyantlardır; HER FİYAT HÜCRESİ için ayrı ürün kaydı üret. Örneğin "Mavi/Beyaz" ve "Çift Kat" ayrı fiyatlıysa iki kayıt; Bidon/Onluk/Galon veya A/B/C bazların her biri ayrı fiyatlıysa her kombinasyon ayrı kayıttır.
- Böyle fiyat sütunu varyantlarında ürün adına varyant etiketini aynen ekle. Sayfada ayrı SKU yoksa sku ve sourceRecordId alanlarında yalnız görüntüdeki temel ürün/model metni ile varyant etiketinin açık bir birleşimini kullan (ör. "ENT YATAY 500 - ÇİFT KAT"); fiyatı olmayan birleşim üretme.
- Bir satırda iki veya daha fazla fiyat görüyorsan bunlardan yalnız ilkini alma. Her fiyatın hangi sütun/ambalaj/baz/renk/katman başlığına ait olduğunu görüntüden eşleştir ve ilgili varyant kaydına yaz.
- Bir tablo hücresinde veya başlık altında birden fazla model kodu listeleniyorsa bunları tek ürün adı altında birleştirme; her kod için ayrı ürün kaydı üret.
- "MODEL 1", "MODEL 2" gibi genel model kodları farklı renk/seri/koleksiyon sayfalarında tekrarlanıyorsa genel kodu tek başına SKU yapma. Sayfada görünen Saruhan, Ayder, Gazez Ceviz gibi renk/seri/koleksiyon başlığını ürün adına, sku ve sourceRecordId alanına ekle (ör. "AYDER MODEL 1").
- Aynı teknik tablo satırında "Single-phase/Tek faz" ve "Three-phase/Üç faz" için iki ayrı model kodu varsa bunlar İKİ AYRI satılabilir üründür. Aynı teknik değerleri paylaşsalar bile her model kodunu ayrı SKU kaydı olarak çıkar; "model A / model B" biçiminde birleştirme.
- Aynı teknik özellikleri ve aynı fotoğrafı kullanan modeller yine ayrı satırlardır; ortak değerleri ve aynı imageRegion bilgisini her modele kopyala.
- Kapak, içindekiler, firma bilgisi ve sadece açıklama olan bölümleri ürün yapma.
- Laminat/parke koleksiyonlarında yalnız dekor/model kodu açıkça basılmış kayıtları ürün yap. Oda fotoğrafı, kullanım sınıfı açıklaması, katman şeması veya önceki dekorun yalnız görsel devam sayfası yeni ürün değildir.
- SKU, model, barkod, ölçü, paket/koli/palet adedi, birim, fiyat ve stok bilgisini yalnızca sayfada açıkça varsa yaz; asla uydurma.
- Stok miktarı görünmüyorsa stockQuantity null ve stockStatus unknown olmalı. Koli/palet adedi stok değildir.
- Fiyat yoksa listPrice null. Para biriminde ₺/TL=TRY, $=USD, €=EUR kullan.
- Ürünün ortak fotoğrafı birden fazla model için geçerliyse aynı imageRegion kullanılabilir.
- Sayfada ürün ailesine ait bir fotoğraf görünüyorsa o ailedeki her model için aynı fotoğrafı kullan; fotoğraf görüldüğü halde imageCandidateIndex ve imageRegion alanlarını ikisini birden null bırakma.
- Aşağıda gömülü resim adayları varsa ürüne ait olan adayın numarasını imageCandidateIndex alanına yaz ve imageRegion alanına o adayın koordinatlarını AYNEN kopyala.
- Adayların hiçbiri ürün fotoğrafı değilse imageCandidateIndex null kullan ve görüntüden doğru imageRegion belirle.
- imageRegion yalnızca ürün fotoğrafını kapsamalı; ürün adı, tablo, fiyat ve dekoratif zemin mümkün olduğunca dışarıda kalmalı.
- Ürün fotoğrafı bir bölümün yalnızca bir kısmındaysa bütün ürün kartını/bölümü değil, fotoğrafın dış sınırlarını ver. Komşu başlık veya sonraki ürün bölümü kutuya girmemeli.
- Teknik çizim, ölçü diyagramı (kesit görünüşü, boyut çizimleri) ve performans grafikleri ürün fotoğrafı DEĞİLDİR; bunları imageRegion olarak seçme. Yalnızca gerçek ürün fotoğrafı/renderını seç.
- Aynı aile için hem temiz tekil ürün fotoğrafı/renderı hem de reklam, kullanım veya fabrika sahnesi varsa temiz tekil ürün görselini seç. Tanıtım metni, insan veya çok sayıda komşu ürün içeren sahneyi yalnız o aile için başka gerçek ürün görseli yoksa kullan.
- Fiyat tablosu, teknik değer tablosu veya metin ağırlıklı bölgelerin kenarlarını imageRegion'a dahil etme.
- Arka planı renkli (gri, bej, mavi vb.) kartlarda fotoğrafın gerçek sınırını kart sınırından ayırt et; mümkünse yalnızca fotoğraf bölgesini kapsayan dar bir kutu çiz.
- Farklı renk/boyut varyantları (kırmızı/mavi, S/M/L) aynı fotoğrafı kullanıyorsa aynı imageRegion paylaşılabilir. Ama farklı varyantlara ait ayrı fotoğraflar varsa her biri kendi imageRegion değerini alsın.
- imageRegion koordinatlarını sayfa görseline göre 0-1000 normalize edilmiş x, y, width, height olarak ver.
- Okunamayan veya şüpheli alanları warnings içine Türkçe yaz. confidence 0-100 gerçekçi bir veri güven puanıdır.
- Teknik özellikleri kısa label/value çiftleri halinde eksiksiz koru.

Gömülü resim adayları (0-1000 koordinat):
${imageCandidates || "Bu sayfada kullanılabilir gömülü resim adayı yok."}

PDF metin katmanı (görüntü ile birlikte doğrula):
---
${text || "Metin katmanı yok; yalnızca sayfa görüntüsünü incele."}
---`;
}

function buildGeminiCatalogPrompt(hints: CatalogExtractionHints, pageText: string): string {
  return `${buildPrompt(hints, pageText)}

ÇIKTI SÖZLEŞMESİ
Yalnızca geçerli bir JSON nesnesi döndür. Kök alanlar: pageBrand, pageCategory, pageCurrency, products, warnings.
products dizisindeki her kayıt şu alanların tamamını içersin:
sourceRecordId, sku, barcode, manufacturerCode, name, brand, category, description, listPrice, currency, taxRate, unitType, stockQuantity, stockStatus, minOrder, packageQuantity, cartonQuantity, palletQuantity, warrantyMonths, technicalSpecs, imageCandidateIndex, imageRegion, confidence, warnings.
Bulunmayan metin/sayı/görsel alanlarını null kullan. technicalSpecs [{"label":"...","value":"..."}], imageRegion ise {"x":0,"y":0,"width":0,"height":0} biçiminde veya null olmalı. stockStatus yalnız in_stock, low_stock, incoming, out_of_stock ya da unknown olabilir.`;
}

function openAiOutputText(payload: Record<string, unknown>): string {
  const direct = clean(payload.output_text);
  if (direct) return direct;

  const output = Array.isArray(payload.output) ? payload.output : [];
  for (const item of output) {
    const content = Array.isArray(asRecord(item).content) ? (asRecord(item).content as unknown[]) : [];
    for (const part of content) {
      const record = asRecord(part);
      const text = clean(record.text);
      if (text) return text;
    }
  }
  return "";
}

function geminiOutputText(payload: Record<string, unknown>): string {
  const candidates = Array.isArray(payload.candidates) ? payload.candidates : [];
  const candidate = asRecord(candidates[0]);
  const content = asRecord(candidate.content);
  const parts = Array.isArray(content.parts) ? content.parts : [];
  return parts.map((part) => clean(asRecord(part).text)).filter(Boolean).join("\n");
}

function apiError(payload: Record<string, unknown>, status: number): string {
  const error = asRecord(payload.error);
  return clean(error.message) || clean(payload.message) || `HTTP ${status}`;
}

async function fetchJsonWithRetry(url: string, init: RequestInit): Promise<Record<string, unknown>> {
  const maxAttempts = clamp(Math.round(Number(process.env.CATALOG_AI_MAX_ATTEMPTS) || 3), 1, 5);
  let lastError = "AI sağlayıcısına ulaşılamadı.";

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const response = await fetch(url, { ...init, signal: AbortSignal.timeout(150_000) });
      let payload: Record<string, unknown> = {};
      try {
        payload = (await response.json()) as Record<string, unknown>;
      } catch {
        payload = {};
      }
      if (response.ok) return payload;

      lastError = apiError(payload, response.status);
      if (!isTransientProviderError(response.status, lastError) || attempt === maxAttempts) {
        const finalError = new Error(lastError);
        finalError.name = "ProviderResponseError";
        throw finalError;
      }
    } catch (error) {
      lastError = safeErrorMessage(error);
      if (error instanceof Error && error.name === "ProviderResponseError") throw new Error(lastError);
      if (attempt === maxAttempts || !isTransientProviderError(0, lastError)) throw new Error(lastError);
    }

    const delayMs = 900 * 2 ** (attempt - 1) + Math.round(Math.random() * 350);
    await delay(delayMs);
  }

  throw new Error(lastError);
}

function isTransientProviderError(status: number, message: string): boolean {
  if (/quota exceeded|free_tier_requests|check your plan and billing/i.test(message)) return false;
  if ([0, 408, 409, 425, 429, 500, 502, 503, 504].includes(status)) return true;
  return /high demand|temporar|rate limit|overloaded|try again|timeout|timed out|network|fetch failed/i.test(message);
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function parseJson(raw: string): Record<string, unknown> {
  const stripped = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  const value = JSON.parse(stripped) as unknown;
  return asRecord(value);
}

function normalizeSpecs(value: unknown): Array<{ label: string; value: string }> {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const rows: Array<{ label: string; value: string }> = [];
  for (const entry of value) {
    const record = asRecord(entry);
    const label = clean(record.label).slice(0, 120);
    const specValue = clean(record.value).slice(0, 500);
    const key = `${label.toLocaleLowerCase("tr-TR")}:${specValue.toLocaleLowerCase("tr-TR")}`;
    if (label && specValue && !seen.has(key)) {
      seen.add(key);
      rows.push({ label, value: specValue });
    }
  }
  return rows.slice(0, 60);
}

function normalizeRegion(value: unknown): CatalogImageRegion | null {
  const record = asRecord(value);
  const x = nullableNumber(record.x);
  const y = nullableNumber(record.y);
  const width = nullableNumber(record.width);
  const height = nullableNumber(record.height);
  if (x === null || y === null || width === null || height === null || width < 10 || height < 10) return null;

  const left = clamp(x, 0, 999);
  const top = clamp(y, 0, 999);
  return {
    x: left,
    y: top,
    width: clamp(width, 1, 1000 - left),
    height: clamp(height, 1, 1000 - top)
  };
}

function providerConfigured(provider: CatalogAiProvider): boolean {
  return provider === "openai" ? Boolean(clean(process.env.OPENAI_API_KEY)) : Boolean(clean(process.env.GEMINI_API_KEY));
}

function geminiModelCandidates(): string[] {
  return uniqueStrings([
    clean(process.env.GEMINI_CATALOG_MODEL) || "gemini-3.1-flash-lite",
    clean(process.env.GEMINI_CATALOG_FALLBACK_MODEL) || "gemini-3.5-flash"
  ]);
}

function catalogMaxOutputTokens(): number {
  return clamp(Math.round(Number(process.env.CATALOG_AI_MAX_OUTPUT_TOKENS) || 50_000), 16_000, 50_000);
}

function nullableStringSchema(): Record<string, unknown> {
  return { type: ["string", "null"] };
}

function nullableNumberSchema(minimum?: number, maximum?: number): Record<string, unknown> {
  return {
    type: ["number", "null"],
    ...(minimum === undefined ? {} : { minimum }),
    ...(maximum === undefined ? {} : { maximum })
  };
}

function isStockStatus(value: string): value is CatalogAiProductCandidate["stockStatus"] {
  return ["in_stock", "low_stock", "incoming", "out_of_stock", "unknown"].includes(value);
}

function normalizeCurrency(value: string | null): string | null {
  if (!value) return null;
  const normalized = value.trim().toUpperCase();
  if (["TRY", "TL", "₺"].includes(normalized)) return "TRY";
  if (["USD", "$", "US$"].includes(normalized)) return "USD";
  if (["EUR", "€"].includes(normalized)) return "EUR";
  if (["GBP", "£"].includes(normalized)) return "GBP";
  return normalized.slice(0, 8);
}

function nullableNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = typeof value === "number" ? value : Number(String(value).replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

function nullableInteger(value: unknown): number | null {
  const parsed = nullableNumber(value);
  return parsed === null || parsed < 0 ? null : Math.round(parsed);
}

function nullableString(value: unknown): string | null {
  const result = clean(value);
  return result ? result : null;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map(clean).filter(Boolean).slice(0, 30) : [];
}

function uniqueStrings(values: Array<string | null | undefined>): string[] {
  return Array.from(new Set(values.map((value) => clean(value)).filter(Boolean))).slice(0, 80);
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function safeErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : "Bilinmeyen sağlayıcı hatası";
  return message
    .replace(/sk-[A-Za-z0-9_-]+/g, "[gizli]")
    .replace(/AIza[A-Za-z0-9_-]{20,}/g, "[gizli]")
    .replace(/AQ\.[A-Za-z0-9._-]{12,}/g, "[gizli]")
    .slice(0, 500);
}
