import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  locateCatalogProductImagesWithAi,
  type CatalogImageRegion
} from "../apps/web/lib/catalog-ai-extractor";
import {
  cropCatalogProductImage,
  extractEmbeddedPdfImages,
  renderPdfPage,
  type ExtractedEmbeddedImage
} from "../apps/web/lib/pdf-catalog-tools";
import { readProductImageMetadata } from "../apps/web/lib/product-image-normalizer";

type ExtractedProduct = {
  id: string;
  sourceRecordId: string;
  sku: string;
  manufacturerCode?: string;
  productName: string;
  description: string;
  brandName: string;
  sourcePage: number;
  stockQuantity: number;
  stockStatus: "in_stock" | "low_stock" | "out_of_stock" | "unknown";
  stockQuantityKnown: boolean;
  technicalSpecs: string;
  specifications: Array<{ label: string; value: string }>;
  imageUrl: string;
  imageRegion: CatalogImageRegion | null;
  missingFields: string[];
  extractionWarnings: string[];
  confidenceScore: number;
  manuallyReviewed?: boolean;
  excluded?: boolean;
};

type PageAudit = {
  pageNumber: number;
  extractedProducts: number;
  productsWithImages: number;
  uniqueImages: number;
  sharedImageAssignments: number;
  [key: string]: unknown;
};

type ImportJob = {
  id: string;
  status: string;
  sourceName: string;
  fileName: string;
  sourceFilePath: string;
  acceptedRecords: number;
  totalRecords: number;
  updatedAt: string;
  notes: string[];
  pageAudits?: PageAudit[];
  pdfProgress: { pageCount: number };
  extractedProducts: ExtractedProduct[];
  [key: string]: unknown;
};

type RegionCheckpoint = {
  version: 1;
  model: string;
  pages: Record<string, Record<string, CatalogImageRegion>>;
};

const SOURCE_NAME = "Pdfler / SAYIM_2026_FIYAT_LISTESI";
const FIRST_PRODUCT_PAGE = 3;
const LAST_PRODUCT_PAGE = 19;
const EXPECTED_PRODUCTS = 278;
const IMAGE_MODEL = process.env.OPENAI_SAYIM_IMAGE_MODEL?.trim() || "gpt-5.4";
const DUPLICATE_SOURCE_ROWS = new Set([
  "5:1300 BAŞLIK / ONLY HEAD",
  "5:1304 BAŞLIK / ONLY HEAD",
  "5:1306 BAŞLIK / ONLY HEAD"
]);
const PRODUCT_NAME_OVERRIDES = new Map<string, string>([
  ["1986", "Yaylı Pompa"],
  ["1989", "Battal Pompa"],
  ["1990", "Küçük Pompa"],
  ["2001", "Tetikli Tabanca Lans - 1/2\"-5/8\"-3/4\" Rekor"],
  ["2002", "Tetikli Tabanca Lans - 1/2\" Lüks Rekor"],
  ["2003", "Tetikli Tabanca Lans - 3/4\" Lüks Rekor"],
  ["2004", "Tetikli Tabanca Süzek - 1/2\"-5/8\"-3/4\" Rekor"],
  ["2005", "Tetikli Tabanca Süzek - 1/2\" Lüks Rekor"],
  ["2006", "Tetikli Tabanca Süzek - 3/4\" Lüks Rekor"],
  ["2007", "5 Fonksiyonlu Tabanca Lans - 1/2\"-5/8\"-3/4\" Rekor"],
  ["2008", "5 Fonksiyonlu Tabanca Lans - 1/2\" Lüks Rekor"],
  ["2009", "5 Fonksiyonlu Tabanca Lans - 3/4\" Lüks Rekor"],
  ["5512", "Hortum Eki 1/2\""],
  ["5534", "Hortum Eki 3/4\""],
  ["1711", "Lüks Rekor 1/2\" Diş - 1/2\""],
  ["1712", "Lüks Rekor 1/2\" Diş - 3/4\""],
  ["1713", "Lüks Rekor 3/4\" Diş - 1/2\""],
  ["1714", "Lüks Rekor 3/4\" Diş - 3/4\""],
  ["1715", "Lüks Rekor 1/2\"-3/4\" Diş - 1/2\""],
  ["1716", "Lüks Rekor 1/2\"-3/4\" Diş - 3/4\""]
]);
const IMAGE_XREF_OVERRIDES = new Map([
  ...["9145", "9146", "9147", "9148", "9149", "9150"].map((sku) => [`5:${sku}`, 183] as const),
  ["7:9130", 263],
  ["7:9131", 259],
  ["7:9132", 261],
  ["7:9133", 261],
  ["7:9134", 263],
  ["7:9135", 265]
]);
const rootDir = path.resolve(import.meta.dirname, "..");
const jobsPath = path.join(rootDir, "data", "ai-import-jobs.json");

async function main(): Promise<void> {
  process.env.CATALOG_AI_PROVIDER = "openai";
  process.env.OPENAI_CATALOG_MODEL = IMAGE_MODEL;

  const jobs = JSON.parse(await readFile(jobsPath, "utf8")) as ImportJob[];
  const job = jobs.find((candidate) => candidate.sourceName === SOURCE_NAME);
  if (!job) throw new Error(`${SOURCE_NAME} import job bulunamadı.`);
  if (job.status === "approved") throw new Error("Sayım import job daha önce onaylanmış; görsel sonlandırma yapılamaz.");

  const products = job.extractedProducts.filter(isCatalogProduct);
  applyProductDataCorrections(products);
  assertProductSet(products);

  const checkpointPath = path.join(rootDir, "data", "catalog-imports", job.id, "sayim-image-regions.json");
  const checkpoint = await loadCheckpoint(checkpointPath);

  for (let pageNumber = FIRST_PRODUCT_PAGE; pageNumber <= LAST_PRODUCT_PAGE; pageNumber += 1) {
    const pageProducts = products.filter((product) => product.sourcePage === pageNumber);
    const cached = checkpoint.pages[String(pageNumber)];
    if (cached && pageProducts.every((product) => cached[product.id])) {
      console.log(`BÖLGE   Sayfa ${pageNumber}: ${pageProducts.length} ürün önbellekten`);
      continue;
    }

    const rendered = await renderPdfPage(job.id, job.sourceFilePath, pageNumber);
    const result = await locateCatalogProductImagesWithAi({
      imageBase64: rendered.imageBase64,
      coordinateImageBase64: rendered.coordinateImageBase64,
      products: pageProducts.map((product) => ({
        productKey: product.id,
        sku: product.sku,
        name: product.productName
      })),
      hints: {
        fileName: job.fileName,
        pageNumber,
        pageCount: job.pdfProgress.pageCount,
        sourceName: job.sourceName
      }
    });
    const matches = Object.fromEntries(
      result.matches.flatMap((match) => match.imageRegion ? [[match.productKey, match.imageRegion]] : [])
    );
    const missing = pageProducts.filter((product) => !matches[product.id]);
    if (missing.length) {
      throw new Error(`Sayfa ${pageNumber} için görsel bölgesi bulunamayan ürünler: ${missing.map((product) => product.sku).join(", ")}`);
    }
    checkpoint.pages[String(pageNumber)] = matches;
    await saveCheckpoint(checkpointPath, checkpoint);
    console.log(`BÖLGE   Sayfa ${pageNumber}: ${pageProducts.length} ürün (${result.provider}/${result.model})`);
  }

  const imageMetadata = new Map<string, { width: number; height: number }>();
  for (let pageNumber = FIRST_PRODUCT_PAGE; pageNumber <= LAST_PRODUCT_PAGE; pageNumber += 1) {
    const pageProducts = products.filter((product) => product.sourcePage === pageNumber);
    const rendered = await renderPdfPage(job.id, job.sourceFilePath, pageNumber);
    const embeddedImages = await extractEmbeddedPdfImages(job.id, job.sourceFilePath, pageNumber);
    const pageRegions = checkpoint.pages[String(pageNumber)]!;
    const pageImageUrls = new Map<string, string>();

    for (const [index, product] of pageProducts.entries()) {
      const sourceRegion = pageRegions[product.id]!;
      const region = expandRegion(sourceRegion);
      const overrideXref = IMAGE_XREF_OVERRIDES.get(`${pageNumber}:${product.sku}`);
      const embeddedImage = overrideXref
        ? embeddedImages.find((image) => image.xref === overrideXref)
        : findBestEmbeddedImageMatch(sourceRegion, embeddedImages);
      if (!embeddedImage) {
        throw new Error(`Sayfa ${pageNumber}, ${product.sku} için temiz PDF görsel katmanı eşleştirilemedi.`);
      }
      const imageKey = `xref:${embeddedImage.xref}`;
      let imageUrl = pageImageUrls.get(imageKey) ?? "";
      if (!imageUrl) {
        imageUrl = await cropCatalogProductImage({
          jobId: job.id,
          pageNumber,
          productIndex: index,
          pageFilePath: rendered.filePath,
          region,
          embeddedImage
        });
        if (!imageUrl) throw new Error(`Sayfa ${pageNumber}, ${product.sku} için ürün görseli üretilemedi.`);
        pageImageUrls.set(imageKey, imageUrl);
      }
      product.imageUrl = imageUrl;
      product.imageRegion = embeddedImage.region;
      product.brandName = "SAYIM";
      product.missingFields = product.missingFields.filter((field) => field !== "image");
      product.extractionWarnings = uniqueStrings([
        ...product.extractionWarnings.filter((warning) => !warning.includes("temiz sayfa kırpımından yeniden üretildi")),
        `Ürün görseli ${IMAGE_MODEL} koordinat denetimiyle PDF'nin şeffaf kaynak katmanından üretildi.`
      ]);
      product.confidenceScore = Math.max(90, product.confidenceScore);
      product.manuallyReviewed = true;
      product.excluded = false;

      if (!imageMetadata.has(imageUrl)) {
        const imagePath = publicImagePath(imageUrl);
        const metadata = await readProductImageMetadata(imagePath);
        if (metadata.width !== 1200 || metadata.height !== 1200 || metadata.format !== "webp") {
          throw new Error(`${product.sku} görseli beklenen 1200x1200 WebP biçiminde değil.`);
        }
        imageMetadata.set(imageUrl, { width: metadata.width, height: metadata.height });
      }
    }
    console.log(`GÖRSEL  Sayfa ${pageNumber}: ${pageProducts.length} ürün, ${pageImageUrls.size} temiz kaynak görsel`);
  }

  for (const product of job.extractedProducts) {
    if (!isCatalogProduct(product)) product.excluded = true;
  }

  job.status = "needs_review";
  job.acceptedRecords = products.length;
  job.totalRecords = job.extractedProducts.length;
  job.updatedAt = new Date().toISOString();
  job.notes = uniqueStrings([
    `${products.length} benzersiz Sayım ürünü sayfa 3-19 aralığında sabitlendi; 3 yinelenen katalog kaydı, teknik tablo ve arka kapak aktarım dışı bırakıldı.`,
    `${imageMetadata.size} benzersiz ürün görseli ${IMAGE_MODEL} koordinat denetimi ve PDF şeffaf kaynak katmanlarıyla 1200x1200 WebP olarak üretildi.`,
    ...job.notes
  ]).slice(0, 100);
  job.pageAudits = refreshPageAudits(job.pageAudits ?? [], products);

  await atomicJsonWrite(jobsPath, jobs);
  console.log(JSON.stringify({ products: products.length, uniqueImages: imageMetadata.size, model: IMAGE_MODEL }, null, 2));
}

function isCatalogProduct(product: ExtractedProduct): boolean {
  return (
    product.sourcePage >= FIRST_PRODUCT_PAGE &&
    product.sourcePage <= LAST_PRODUCT_PAGE &&
    !DUPLICATE_SOURCE_ROWS.has(`${product.sourcePage}:${product.sku}`)
  );
}

function applyProductDataCorrections(products: ExtractedProduct[]): void {
  for (const product of products) {
    const normalizedSku = product.sku.match(/^(?:A-)?\d{4}/)?.[0] ?? product.sku.trim();
    product.sku = normalizedSku;
    product.sourceRecordId = normalizedSku;
    product.manufacturerCode = normalizedSku;
    product.stockQuantity = 0;
    product.stockStatus = "unknown";
    product.stockQuantityKnown = false;

    const overriddenName = PRODUCT_NAME_OVERRIDES.get(normalizedSku);
    if (overriddenName) {
      product.productName = overriddenName;
      product.description = `${overriddenName}.`;
    }
    applyLuxCouplingSpecs(product);
    product.extractionWarnings = uniqueStrings([
      ...product.extractionWarnings,
      "Katalogdaki koli/çuval adedi stok değildir; stok durumu teyit gerekli olarak işaretlendi."
    ]);
  }

  const names = new Map<string, ExtractedProduct[]>();
  for (const product of products) {
    names.set(product.productName, [...(names.get(product.productName) ?? []), product]);
  }
  for (const variants of names.values()) {
    if (variants.length < 2) continue;
    for (const product of variants) {
      const variant = product.specifications.find((specification) =>
        ["Ölçü", "Nozul", "Bağlantı", "Yön", "Tip"].includes(specification.label)
      );
      if (!variant || product.productName.includes(variant.value)) continue;
      const prefix = variant.label === "Ölçü" ? "" : `${variant.label} `;
      product.productName = `${product.productName} - ${prefix}${variant.value}`;
    }
  }
}

function applyLuxCouplingSpecs(product: ExtractedProduct): void {
  const variants: Record<string, { thread: string; hose: string }> = {
    "1711": { thread: "1/2\"", hose: "1/2\"" },
    "1712": { thread: "1/2\"", hose: "3/4\"" },
    "1713": { thread: "3/4\"", hose: "1/2\"" },
    "1714": { thread: "3/4\"", hose: "3/4\"" },
    "1715": { thread: "1/2\"-3/4\"", hose: "1/2\"" },
    "1716": { thread: "1/2\"-3/4\"", hose: "3/4\"" }
  };
  const variant = variants[product.sku];
  if (!variant) return;
  const commercialSpecs = product.specifications.filter((specification) =>
    /^(?:KDV|K\.D\.V\.|Koli Adeti|Ambalaj)$/i.test(specification.label)
  );
  product.specifications = [
    { label: "Diş", value: variant.thread },
    { label: "Hortum bağlantısı", value: variant.hose },
    ...commercialSpecs
  ];
  product.technicalSpecs = product.specifications
    .map((specification) => `${specification.label}: ${specification.value}`)
    .join(" | ");
}

function assertProductSet(products: ExtractedProduct[]): void {
  if (products.length !== EXPECTED_PRODUCTS) {
    throw new Error(`Beklenen ${EXPECTED_PRODUCTS} Sayım ürünü yerine ${products.length} ürün bulundu.`);
  }
  const skus = new Set(products.map((product) => product.sku));
  if (skus.size !== products.length) throw new Error("Sayım ürünlerinde yinelenen SKU bulundu.");
  const invalid = products.filter((product) => !product.sku || !product.productName || !product.brandName);
  if (invalid.length) throw new Error(`${invalid.length} Sayım ürününde zorunlu alan eksik.`);
}

async function loadCheckpoint(filePath: string): Promise<RegionCheckpoint> {
  try {
    const parsed = JSON.parse(await readFile(filePath, "utf8")) as RegionCheckpoint;
    if (parsed.version === 1 && parsed.model === IMAGE_MODEL && parsed.pages) return parsed;
  } catch {
    // A missing or stale checkpoint starts a fresh localization pass.
  }
  return { version: 1, model: IMAGE_MODEL, pages: {} };
}

async function saveCheckpoint(filePath: string, checkpoint: RegionCheckpoint): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  await atomicJsonWrite(filePath, checkpoint);
}

async function atomicJsonWrite(filePath: string, value: unknown): Promise<void> {
  const temporaryPath = `${filePath}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`);
  await rename(temporaryPath, filePath);
}

function expandRegion(region: CatalogImageRegion): CatalogImageRegion {
  const padding = 7;
  const x = Math.max(0, Math.floor(region.x - padding));
  const y = Math.max(0, Math.floor(region.y - padding));
  const right = Math.min(1000, Math.ceil(region.x + region.width + padding));
  const bottom = Math.min(1000, Math.ceil(region.y + region.height + padding));
  return { x, y, width: right - x, height: bottom - y };
}

function findBestEmbeddedImageMatch(
  target: CatalogImageRegion,
  embeddedImages: ExtractedEmbeddedImage[]
): ExtractedEmbeddedImage | undefined {
  const targetCenterX = target.x + target.width / 2;
  const targetCenterY = target.y + target.height / 2;
  return embeddedImages
    .filter((image) => embeddedRegionCanReplaceTarget(target, image.region))
    .sort((a, b) => {
      const aCoverage = overlapCoverage(target, a.region);
      const bCoverage = overlapCoverage(target, b.region);
      if (bCoverage !== aCoverage) return bCoverage - aCoverage;
      const aDistance = Math.hypot(
        targetCenterX - (a.region.x + a.region.width / 2),
        targetCenterY - (a.region.y + a.region.height / 2)
      );
      const bDistance = Math.hypot(
        targetCenterX - (b.region.x + b.region.width / 2),
        targetCenterY - (b.region.y + b.region.height / 2)
      );
      return aDistance - bDistance || b.quality - a.quality;
    })[0];
}

function embeddedRegionCanReplaceTarget(target: CatalogImageRegion, candidate: CatalogImageRegion): boolean {
  const targetArea = target.width * target.height;
  if (targetArea <= 0) return false;
  return (
    candidate.width >= target.width * 0.4 &&
    candidate.height >= target.height * 0.4 &&
    candidate.width <= target.width * 2.2 &&
    candidate.height <= target.height * 2.2 &&
    overlapArea(target, candidate) / targetArea >= 0.18
  );
}

function overlapCoverage(target: CatalogImageRegion, candidate: CatalogImageRegion): number {
  const intersection = overlapArea(target, candidate);
  const smallerArea = Math.min(target.width * target.height, candidate.width * candidate.height);
  return smallerArea > 0 ? intersection / smallerArea : 0;
}

function overlapArea(a: CatalogImageRegion, b: CatalogImageRegion): number {
  const left = Math.max(a.x, b.x);
  const top = Math.max(a.y, b.y);
  const right = Math.min(a.x + a.width, b.x + b.width);
  const bottom = Math.min(a.y + a.height, b.y + b.height);
  return Math.max(0, right - left) * Math.max(0, bottom - top);
}

function refreshPageAudits(pageAudits: PageAudit[], products: ExtractedProduct[]): PageAudit[] {
  return pageAudits.map((audit) => {
    const pageProducts = products.filter((product) => product.sourcePage === audit.pageNumber);
    const images = pageProducts.map((product) => product.imageUrl).filter(Boolean);
    const uniqueImages = new Set(images);
    return {
      ...audit,
      extractedProducts: pageProducts.length,
      productsWithImages: images.length,
      uniqueImages: uniqueImages.size,
      sharedImageAssignments: images.length - uniqueImages.size
    };
  });
}

function publicImagePath(imageUrl: string): string {
  const relativePath = imageUrl.replace(/^\//, "").split("?", 1)[0]!;
  return path.join(rootDir, "apps", "web", "public", relativePath);
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
