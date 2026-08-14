import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { execFile as execFileCallback } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import type { ImportedSupplierProduct } from "@entas/catalog";
import type { CatalogAiProductCandidate, CatalogImageRegion } from "../apps/web/lib/catalog-ai-extractor";
import {
  extractEmbeddedPdfImages,
  type ExtractedEmbeddedImage
} from "../apps/web/lib/pdf-catalog-tools";
import {
  createEntasCatalogProductImage,
  cropProductImageToPng,
  ENTAS_CATALOG_IMAGE_CANVAS_SIZE,
  readProductImageMetadata
} from "../apps/web/lib/product-image-normalizer";

type SeedProduct = {
  page: number;
  manufacturerCode: string;
  price: number;
  currency: string;
  name: string;
  variant: string;
  raw: string;
  categoryPath: string[];
  codeX: number;
  codeY: number;
  externalId: string;
  sku: string;
  image: {
    pageFile: string;
    imageKey: string;
    crop: { left: number; top: number; width: number; height: number };
  };
};

type PageAudit = {
  page: number;
  extraction: { products: CatalogAiProductCandidate[] };
};

type VisualSource = {
  key: string;
  page: number;
  candidateIndex: number | null;
  region: CatalogImageRegion;
};

type QualityRecord = {
  externalId: string;
  productName: string;
  aiMatched: boolean;
  visual: VisualSource;
};

type ResolvedProduct = {
  seed: SeedProduct;
  productName: string;
  aiMatched: boolean;
  visual: VisualSource;
};

const rootDir = path.resolve(import.meta.dirname, "..");
const sourcePdf = process.env.KF_CATALOG_PDF || "/Users/zumerkekillioglu/Downloads/2026 Katalog.pdf";
const seedPath = path.join(rootDir, "scripts", "catalog-data", "kf-kuzey-2026.json");
const qualityMapPath = path.join(rootDir, "scripts", "catalog-data", "kf-kuzey-quality-v2.json");
const auditDir = path.join(rootDir, "tmp", "pdfs", "kf-kuzey-quality", "ai-pages");
const outputRenderDir = path.join(rootDir, "tmp", "pdfs", "kf-kuzey-quality", "render-400");
const releaseVersion = "2026-08-14-kf-kuzey-fittings-quality-v2";
const releaseDir = path.join(rootDir, "deploy", "catalog-releases", releaseVersion);
const uploadSubdir = path.join("catalog-imports", "kf-kuzey-fittings-2026-quality-v2", "products");
const uploadDir = path.join(releaseDir, "uploads", uploadSubdir);
const officialPdfUrl = "https://kuzeyfittings.com.tr/wp-content/uploads/2026/06/2026-Katalog.pdf";
const extractionJobId = "kf-kuzey-quality-v2";
const execFile = promisify(execFileCallback);
const outputPageCache = new Map<number, Promise<{ filePath: string; width: number; height: number }>>();
const shouldWrite = process.argv.includes("--write");
const refreshAudit = process.argv.includes("--refresh-audit");

async function main(): Promise<void> {
  process.env.CATALOG_PDF_RENDER_DPI = "400";
  const allSeeds = JSON.parse(await readFile(seedPath, "utf8")) as SeedProduct[];
  const seeds = allSeeds.filter(isRealCatalogRecord);
  const pages = [...new Set(seeds.map((seed) => seed.page))].sort((left, right) => left - right);
  const embeddedByPage = new Map<number, ExtractedEmbeddedImage[]>();
  await mapWithConcurrency(pages, 4, async (page) => {
    embeddedByPage.set(page, await extractEmbeddedPdfImages(extractionJobId, sourcePdf, page));
  });

  let resolved: ResolvedProduct[];
  if (!refreshAudit && await fileExists(qualityMapPath)) {
    const qualityMap = JSON.parse(await readFile(qualityMapPath, "utf8")) as QualityRecord[];
    const byExternalId = new Map(qualityMap.map((record) => [record.externalId, record]));
    resolved = seeds.map((seed) => {
      const record = byExternalId.get(seed.externalId);
      if (!record) throw new Error(`Kalite haritasında ürün yok: ${seed.externalId}`);
      return { seed, productName: record.productName, aiMatched: record.aiMatched, visual: record.visual };
    });
  } else {
    const audits = new Map<number, PageAudit>();
    for (const page of pages) {
      const auditPath = path.join(auditDir, `page-${String(page).padStart(3, "0")}.json`);
      audits.set(page, JSON.parse(await readFile(auditPath, "utf8")) as PageAudit);
    }
    resolved = seeds.map((seed) => resolveProduct(seed, audits.get(seed.page)!, embeddedByPage.get(seed.page) || []));
    if (shouldWrite) {
      const qualityMap: QualityRecord[] = resolved.map((product) => ({
        externalId: product.seed.externalId,
        productName: product.productName,
        aiMatched: product.aiMatched,
        visual: product.visual
      }));
      await writeFile(qualityMapPath, `${JSON.stringify(qualityMap, null, 2)}\n`);
    }
  }

  assertResolvedProducts(resolved);
  const uniqueVisuals = [...new Map(resolved.map((product) => [product.visual.key, product.visual])).values()]
    .sort((left, right) => left.key.localeCompare(right.key));
  const report = {
    releaseVersion,
    originalSeedCount: allSeeds.length,
    removedPhantomRecordCount: allSeeds.length - seeds.length,
    productCount: resolved.length,
    aiMatchedProductCount: resolved.filter((product) => product.aiMatched).length,
    correctedNameCount: resolved.filter((product) => product.productName !== product.seed.name).length,
    uniqueImageCount: uniqueVisuals.length,
    catalogPageCount: pages.length,
    mode: shouldWrite ? "write" : "dry-run"
  };
  if (!shouldWrite) {
    console.log(JSON.stringify({ ...report, sample: resolved.slice(0, 8) }, null, 2));
    return;
  }

  await rm(releaseDir, { recursive: true, force: true });
  await rm(outputRenderDir, { recursive: true, force: true });
  await mkdir(uploadDir, { recursive: true });
  await mkdir(outputRenderDir, { recursive: true });
  const imageUrls = new Map<string, string>();
  const imageStats = await mapWithConcurrency(uniqueVisuals, 4, async (visual, index) => {
    const normalized = await createEntasCatalogProductImage(await cropRenderedRegion(visual));
    const filename = `${String(index + 1).padStart(4, "0")}-p${String(visual.page).padStart(3, "0")}-${slugify(visual.key)}.webp`;
    await writeFile(path.join(uploadDir, filename), normalized.buffer);
    imageUrls.set(visual.key, `/uploads/${uploadSubdir.split(path.sep).join("/")}/${filename}`);
    return {
      sourceWidth: normalized.sourceWidth,
      sourceHeight: normalized.sourceHeight,
      embedded: false
    };
  });

  const products = resolved.map((product) => toImportedProduct(
    product,
    required(imageUrls.get(product.visual.key), product.visual.key)
  ));
  await writeFile(path.join(releaseDir, "products.json"), `${JSON.stringify(products, null, 2)}\n`);
  await writeFile(path.join(releaseDir, "manifest.json"), `${JSON.stringify({
    ...report,
    createdAt: new Date().toISOString(),
    source: {
      productData: "KF Kuzey Fittings 2026/1 resmi fiyat kataloğu",
      officialCatalogPage: "https://kuzeyfittings.com.tr/katalog/",
      officialPdf: officialPdfUrl,
      pdfSha256: "b1927d66381af1127d60be5b116cef669c7fecf479024033e609fea0f9f7f8b6"
    },
    verificationPolicy: "124 ürün sayfası Gemini görsel+PDF metin katmanı ile denetlendi; yalnız mevcut katalog kodları güncellendi; yoğun tablolar koordinat ve ürün ailesi kurallarıyla tamamlandı",
    imagePolicy: "CorelDRAW katman/sprite bozulmalarını önlemek için resmi PDF'nin doğru görünen sayfası 400 DPI'da işlendi; doğrulanmış dar ürün sınırı kırpıldı; üretken detay eklenmeden oran korumalı Lanczos3, kontrollü hafif keskinleştirme, beyaz zemin, ENTAŞBURADA çerçeve ve düşük opaklıklı watermark uygulandı",
    normalizedCanvas: `${ENTAS_CATALOG_IMAGE_CANVAS_SIZE}x${ENTAS_CATALOG_IMAGE_CANVAS_SIZE} WebP`,
    directlyExtractedImageCount: 0,
    faithful400DpiRenderedCropCount: imageStats.length,
    lowResolutionSourceCount: imageStats.filter((image) => Math.min(image.sourceWidth, image.sourceHeight) < 220).length,
    minimumSourceEdge: imageStats.reduce((minimum, image) => Math.min(minimum, image.sourceWidth, image.sourceHeight), Number.POSITIVE_INFINITY),
    maximumSourceEdge: imageStats.reduce((maximum, image) => Math.max(maximum, image.sourceWidth, image.sourceHeight), 0),
    pricePolicy: "2026/1 resmi katalog liste fiyatı; TRY ve sayfa 33 için USD; bayi oturumu dışında gizli; F.Sorunuz satırları 0.00",
    stockPolicy: "Katalogda ürün yer alıyor; gerçek stok adedi bilinmediği için stockQuantityKnown=false"
  }, null, 2)}\n`);
  console.log(JSON.stringify({ ...report, imageStats: {
    directlyExtracted: 0,
    faithful400DpiRenderedCrop: imageStats.length,
    lowResolution: imageStats.filter((image) => Math.min(image.sourceWidth, image.sourceHeight) < 220).length
  } }, null, 2));
}

function resolveProduct(seed: SeedProduct, audit: PageAudit, embedded: ExtractedEmbeddedImage[]): ResolvedProduct {
  const aiProduct = findAiProduct(seed, audit.extraction.products);
  const manualIndex = manualCandidateIndex(seed);
  const selectedImage = manualIndex === null
    ? aiCandidate(aiProduct, embedded) || fallbackCandidate(seed, embedded)
    : embedded.find((image) => image.index === manualIndex);
  if (!selectedImage && !aiProduct?.imageRegion) throw new Error(`Görsel eşleşmedi: ${seed.externalId}`);
  const region = selectedImage?.region || aiProduct!.imageRegion!;
  const candidateIndex = selectedImage?.index ?? null;
  const visual: VisualSource = {
    key: candidateIndex === null
      ? `p${seed.page}-region-${region.x}-${region.y}-${region.width}-${region.height}`
      : `p${seed.page}-candidate-${candidateIndex}`,
    page: seed.page,
    candidateIndex,
    region
  };
  return {
    seed,
    productName: correctedProductName(seed, aiProduct),
    aiMatched: Boolean(aiProduct),
    visual
  };
}

function findAiProduct(seed: SeedProduct, products: CatalogAiProductCandidate[]): CatalogAiProductCandidate | null {
  const wanted = normalizeIdentity(seed.manufacturerCode);
  const identities = (product: CatalogAiProductCandidate): string[] => [product.manufacturerCode, product.sku, product.sourceRecordId]
    .map(normalizeIdentity)
    .filter(Boolean);
  const exact = products.find((product) => identities(product).includes(wanted));
  if (exact) return exact;
  if (![30, 31].includes(seed.page)) return null;
  return products
    .filter((product) => identities(product).some((identity) => identity.includes(wanted) || wanted.includes(identity)))
    .sort((left, right) => Math.abs(normalizeIdentity(left.manufacturerCode).length - wanted.length) - Math.abs(normalizeIdentity(right.manufacturerCode).length - wanted.length))[0] || null;
}

function aiCandidate(product: CatalogAiProductCandidate | null, embedded: ExtractedEmbeddedImage[]): ExtractedEmbeddedImage | null {
  if (!product) return null;
  if (product.imageCandidateIndex !== null) {
    const exact = embedded.find((image) => image.index === product.imageCandidateIndex);
    if (exact) return exact;
  }
  if (!product.imageRegion) return null;
  const nearest = [...embedded].sort((left, right) => regionDistance(left.region, product.imageRegion!) - regionDistance(right.region, product.imageRegion!))[0];
  return nearest && regionDistance(nearest.region, product.imageRegion) < 85 ? nearest : null;
}

function fallbackCandidate(seed: SeedProduct, embedded: ExtractedEmbeddedImage[]): ExtractedEmbeddedImage | null {
  if (!embedded.length) return null;
  const currentRegion = parseImageKeyRegion(seed.image.imageKey);
  const current = currentRegion
    ? [...embedded].sort((left, right) => regionDistance(left.region, currentRegion) - regionDistance(right.region, currentRegion))[0]
    : undefined;
  const pageHeight = 841.89;
  const currentTop = current ? current.region.y / 1000 * pageHeight : Number.POSITIVE_INFINITY;
  if (current && currentTop <= seed.codeY + 5) return current;

  const pageWidth = 595.28;
  const eligible = embedded.filter((image) => image.region.y / 1000 * pageHeight <= seed.codeY + 5);
  if (!eligible.length) return current || embedded[0]!;
  return [...eligible].sort((left, right) => {
    const score = (image: ExtractedEmbeddedImage): number => {
      const x0 = image.region.x / 1000 * pageWidth;
      const x1 = (image.region.x + image.region.width) / 1000 * pageWidth;
      const y1 = (image.region.y + image.region.height) / 1000 * pageHeight;
      const horizontal = seed.codeX < x0 ? x0 - seed.codeX : seed.codeX > x1 ? seed.codeX - x1 : 0;
      const vertical = Math.max(0, seed.codeY - y1);
      return horizontal + vertical * 1.8;
    };
    return score(left) - score(right);
  })[0]!;
}

function manualCandidateIndex(seed: SeedProduct): number | null {
  const name = normalizeTurkish(seed.name);
  if (seed.page === 4 || seed.page === 5) {
    if (name.includes("INEGAL TE")) return 12;
    if (name.includes("KRUVA")) return 11;
    if (name.includes("PIK KOLYE")) return 10;
    if (name.includes("MANSON REDUKSIYON")) return 9;
    if (name.includes("REDUKSIYON")) return 8;
    if (name.includes("INCE MANSON") || name.includes("KALIN MANSON")) return 6;
    if (name.includes("TAPA")) return 5;
    if (name.includes("KIVRIK DIRSEK")) return 4;
    if (name.includes("KONIK REKOR")) return 3;
    if (name.includes("NIPEL")) return 2;
    if (name.includes(" TE ") || name.endsWith(" TE")) return 1;
    if (name.includes("DIRSEK")) return 0;
  }
  if (seed.page === 114) {
    if (seed.manufacturerCode.startsWith("GB-")) return 0;
    if (seed.manufacturerCode.startsWith("KP")) return 1;
  }
  if (seed.page === 116) {
    if (seed.manufacturerCode.startsWith("213")) return 0;
    if (seed.manufacturerCode.startsWith("214")) return 1;
    if (seed.manufacturerCode.startsWith("215")) return 2;
  }
  if (seed.page === 124) {
    if (seed.manufacturerCode.startsWith("148")) return 0;
    if (seed.manufacturerCode.startsWith("348")) return 1;
  }
  return null;
}

function correctedProductName(seed: SeedProduct, aiProduct: CatalogAiProductCandidate | null): string {
  let base = aiProduct?.name || stripTrailingCode(seed.name, seed.manufacturerCode);
  if (seed.manufacturerCode === "KF501") base = "Çelik Metrik Bağlantılar (M10) - 30 cm";
  if (seed.page === 114 && seed.manufacturerCode.startsWith("KP")) base = "Plastik Küresel Vana";
  if (seed.page === 116 && seed.manufacturerCode.startsWith("213")) base = "Kaplin Erkek";
  if (seed.page === 116 && seed.manufacturerCode.startsWith("214")) base = "Kaplin Dişi";
  if (seed.page === 116 && seed.manufacturerCode.startsWith("215")) base = "Kaplin Tapa";
  if (seed.page === 124 && seed.manufacturerCode.startsWith("148")) base = "Çift Çıkışlı Priz Kolye";
  if (seed.page === 124 && seed.manufacturerCode.startsWith("348")) base = "Metal Priz Kolye";
  base = stripTrailingCode(cleanProductText(base), seed.manufacturerCode);
  return `${base} - ${seed.manufacturerCode}`;
}

function isRealCatalogRecord(seed: SeedProduct): boolean {
  if (![30, 31].includes(seed.page)) return true;
  return seed.manufacturerCode.includes("/");
}

function assertResolvedProducts(products: ResolvedProduct[]): void {
  if (products.length < 2_300) throw new Error(`Kalite sürümü ürün kapsamı yetersiz: ${products.length}`);
  const externalIds = new Set(products.map((product) => product.seed.externalId));
  if (externalIds.size !== products.length) throw new Error("Kalite sürümünde tekrarlanan externalId bulundu");
  const byCode = new Map(products.map((product) => [`${product.seed.page}:${normalizeIdentity(product.seed.manufacturerCode)}`, product]));
  assertRegression(byCode, "4:KF001", "GALVANIZ DIRSEK", 0);
  assertRegression(byCode, "7:KB3011", "SIYAH MIX BANYO BATARYASI", 1);
  assertRegression(byCode, "7:KB303", "MIX KUGU LAVABO BATARYASI", 2);
  assertRegression(byCode, "114:KP001", "PLASTIK KURESEL VANA", 1);
  assertRegression(byCode, "114:S1651", "NORMAL HORTUM EKLERI", 7);
  assertRegression(byCode, "116:21311", "KAPLIN ERKEK", 0);
  assertRegression(byCode, "124:148311", "CIFT CIKISLI PRIZ KOLYE", 0);
}

function assertRegression(products: Map<string, ResolvedProduct>, key: string, name: string, candidateIndex: number): void {
  const product = products.get(key);
  if (!product) throw new Error(`Regresyon ürünü bulunamadı: ${key}`);
  if (!normalizeTurkish(product.productName).includes(name)) throw new Error(`Regresyon ürün adı hatalı: ${key} -> ${product.productName}`);
  if (product.visual.candidateIndex !== candidateIndex) throw new Error(`Regresyon görseli hatalı: ${key} -> ${product.visual.candidateIndex}`);
}

async function cropRenderedRegion(visual: VisualSource): Promise<Buffer> {
  const rendered = await renderOutputPage(visual.page);
  const padding = 8;
  const left = clamp(Math.floor(visual.region.x / 1000 * rendered.width) - padding, 0, rendered.width - 1);
  const top = clamp(Math.floor(visual.region.y / 1000 * rendered.height) - padding, 0, rendered.height - 1);
  const width = clamp(Math.ceil(visual.region.width / 1000 * rendered.width) + padding * 2, 1, rendered.width - left);
  const height = clamp(Math.ceil(visual.region.height / 1000 * rendered.height) + padding * 2, 1, rendered.height - top);
  return cropProductImageToPng(rendered.filePath, { left, top, width, height });
}

function renderOutputPage(page: number): Promise<{ filePath: string; width: number; height: number }> {
  const cached = outputPageCache.get(page);
  if (cached) return cached;
  const rendering = (async () => {
    const prefix = path.join(outputRenderDir, `page-${String(page).padStart(4, "0")}`);
    const filePath = `${prefix}.jpg`;
    await execFile("pdftoppm", [
      "-f", String(page), "-l", String(page), "-singlefile",
      "-jpeg", "-jpegopt", "quality=96", "-r", "400", sourcePdf, prefix
    ], { maxBuffer: 16 * 1024 * 1024, timeout: 120_000 });
    const metadata = await readProductImageMetadata(filePath);
    return { filePath, width: metadata.width, height: metadata.height };
  })();
  outputPageCache.set(page, rendering);
  return rendering;
}

function toImportedProduct(product: ResolvedProduct, imageUrl: string): ImportedSupplierProduct {
  const { seed } = product;
  const category = seed.categoryPath.at(-1) || "KF Kuzey Fittings Ürünleri";
  const description = [
    `${product.productName}.`,
    seed.variant ? `Varyant: ${seed.variant}.` : "",
    `KF Kuzey Fittings 2026/1 resmi kataloğunun ${seed.page}. sayfasından aktarılmış ve görsel eşleşmesi kalite denetiminden geçirilmiştir.`,
    `Katalog kaydı: ${seed.raw}.`,
    "Gerçek stok ve teslim süresi sipariş öncesinde teyit edilmelidir."
  ].filter(Boolean).join(" ");
  return {
    sourceKey: "catalog-kf-kuzey-fittings-2026-1",
    sourceName: "KF Kuzey Fittings 2026/1 Fiyat Kataloğu - Kalite V2",
    externalId: seed.externalId,
    sku: seed.sku,
    manufacturerCode: seed.manufacturerCode,
    productName: product.productName,
    brandName: "KF KUZEY FITTINGS",
    categoryPath: seed.categoryPath,
    categoryName: category,
    unitType: "ADET",
    taxRate: "20",
    currency: seed.currency,
    listPrice: seed.price.toFixed(2),
    stockQuantity: 1,
    stockStatus: "in_stock",
    stockQuantityKnown: false,
    description,
    technicalSpecs: [
      { label: "Marka", value: "KF KUZEY FITTINGS" },
      { label: "Ürün / Model Kodu", value: seed.manufacturerCode },
      ...(seed.variant ? [{ label: "Varyant", value: seed.variant }] : []),
      { label: "2026/1 Katalog Sayfası", value: String(seed.page) },
      { label: "Katalog Satırı", value: seed.raw },
      { label: "Görsel Kalitesi", value: "PDF özgün görseli; oran korumalı 2160px ENTAŞ sunum standardı" },
      { label: "Stok", value: "Katalog ürünü; gerçek stok adedi ve teslim süresi için teyit gerekli" }
    ],
    minOrder: 1,
    packageQuantity: 1,
    cartonQuantity: 1,
    palletQuantity: 1,
    warrantyMonths: 0,
    imageUrl,
    sourceUrl: `${officialPdfUrl}#page=${seed.page}`,
    priceVisibleToPublic: false
  };
}

function parseImageKeyRegion(imageKey: string): CatalogImageRegion | null {
  const match = imageKey.match(/^p\d+-(\d+(?:\.\d+)?)-(\d+(?:\.\d+)?)-(\d+(?:\.\d+)?)-(\d+(?:\.\d+)?)$/);
  if (!match) return null;
  const [x0, y0, x1, y1] = match.slice(1).map(Number);
  return { x: x0! / 595.28 * 1000, y: y0! / 841.89 * 1000, width: (x1! - x0!) / 595.28 * 1000, height: (y1! - y0!) / 841.89 * 1000 };
}

function regionDistance(left: CatalogImageRegion, right: CatalogImageRegion): number {
  const leftCenter = [left.x + left.width / 2, left.y + left.height / 2];
  const rightCenter = [right.x + right.width / 2, right.y + right.height / 2];
  return Math.hypot(leftCenter[0]! - rightCenter[0]!, leftCenter[1]! - rightCenter[1]!);
}

function stripTrailingCode(value: string, code: string): string {
  const escaped = code.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return value.replace(new RegExp(`\\s*[-–—]\\s*${escaped}\\s*$`, "i"), "").trim();
}

function cleanProductText(value: string): string {
  return value.replace(/\s+/g, " ").replace(/^[-–—)\s]+/, "").trim();
}

function normalizeIdentity(value: string | null | undefined): string {
  return normalizeTurkish(value || "").replace(/[^A-Z0-9]/g, "");
}

function normalizeTurkish(value: string): string {
  return value.toLocaleUpperCase("tr-TR")
    .replace(/İ/g, "I").replace(/Ş/g, "S").replace(/Ğ/g, "G")
    .replace(/Ü/g, "U").replace(/Ö/g, "O").replace(/Ç/g, "C");
}

function required(value: string | undefined, key: string): string {
  if (!value) throw new Error(`Görsel URL'si üretilemedi: ${key}`);
  return value;
}

function slugify(value: string): string {
  return value.toLocaleLowerCase("tr-TR").replace(/ı/g, "i").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80);
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await readFile(filePath);
    return true;
  } catch {
    return false;
  }
}

async function mapWithConcurrency<T, R>(items: T[], concurrency: number, mapper: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let nextIndex = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    for (;;) {
      const index = nextIndex++;
      if (index >= items.length) return;
      results[index] = await mapper(items[index]!, index);
    }
  });
  await Promise.all(workers);
  return results;
}

void main();
