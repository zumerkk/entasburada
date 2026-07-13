import "server-only";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, open, readFile, rename, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { createImportAudit, mergeImportedProducts, type ImportedSupplierProduct, type StockStatus } from "@entas/catalog";
import { parseProductXmlBufferPreview, type ImportedProductRow, type ImportIssue } from "@entas/import-engine";
import { appendAuditLogs, loadCatalogStore, saveCatalogStore } from "./catalog-repository";
import {
  canonicalFloorpanModelCode,
  extractStructuredLamindoorPage,
  normalizeFloorpanCatalogProducts,
  normalizeLamindoorCatalogProducts,
  extractCatalogPageWithAi,
  locateCatalogProductImagesWithAi,
  qualifyGenericCatalogModelIdentities,
  reconcileCatalogOcrPhasePairs,
  type CatalogAiProductCandidate,
  type CatalogImageRegion,
  type CatalogPageExtraction,
  type CatalogVerificationSummary
} from "./catalog-ai-extractor";
import {
  cropCatalogProductImage,
  extractEmbeddedPdfImageRegions,
  extractEmbeddedPdfImages,
  extractPdfModelOcrHints,
  extractPdfPageText,
  extractPdfWordBoxes,
  inspectPdf,
  privatePdfSourcePath,
  renderPdfPage,
  shouldSkipPdfPage,
  validateAndStorePdf,
  type EmbeddedPdfImageRegion,
  type ExtractedEmbeddedImage
} from "./pdf-catalog-tools";
import { deriveGridProductImageRegions } from "./pdf-grid-image-regions";

export type SmartImportType = "xml" | "pdf" | "csv" | "xlsx" | "json" | "image" | "zip" | "link";
export type SmartImportStatus = "queued" | "processing" | "preview" | "needs_review" | "approved" | "rejected" | "failed";

export interface PdfImportOptions {
  sourceName?: string;
  brandHint?: string;
  categoryHint?: string;
  defaultCurrency?: string;
  startPage?: number;
  endPage?: number;
}

export interface PdfImportProgress {
  pageCount: number;
  startPage: number;
  endPage: number;
  processedPages: number;
  successfulPages: number;
  failedPages: number;
  processedPageNumbers: number[];
  failedPageNumbers: number[];
  currentPage?: number;
  percent: number;
}

export interface ImportQualityIssue {
  id: string;
  severity: "info" | "warning" | "danger";
  field: string;
  message: string;
  productId?: string;
}

export interface PdfPageAudit {
  pageNumber: number;
  status: "ok" | "needs_review" | "empty" | "failed";
  provider: CatalogPageExtraction["provider"];
  model: string;
  textCharacters: number;
  extractedProducts: number;
  productsWithImages: number;
  uniqueImages: number;
  sharedImageAssignments: number;
  warningCount: number;
  verification?: CatalogVerificationSummary;
  messages: string[];
}

export interface ImportExtractedProduct {
  id: string;
  sourceRecordId: string;
  sku: string;
  barcode: string;
  manufacturerCode: string;
  productName: string;
  brandName: string;
  categoryName: string;
  categoryPath: string[];
  listPrice: string;
  currency: string;
  taxRate: string;
  unitType: string;
  stockQuantity: number;
  stockStatus: StockStatus;
  stockQuantityKnown: boolean;
  imageUrl: string;
  sourceUrl: string;
  description: string;
  technicalSpecs: string;
  specifications: Array<{ label: string; value: string }>;
  minOrder: number;
  packageQuantity: number;
  cartonQuantity: number;
  palletQuantity: number;
  warrantyMonths: number;
  sourcePage?: number;
  imageRegion?: CatalogImageRegion;
  extractionWarnings: string[];
  confidenceScore: number;
  duplicateRisk: "none" | "possible" | "high";
  missingFields: string[];
  manuallyReviewed?: boolean;
  excluded?: boolean;
}

export interface SmartImportJob {
  id: string;
  type: SmartImportType;
  status: SmartImportStatus;
  sourceName: string;
  fileName: string;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  totalRecords: number;
  acceptedRecords: number;
  extractedProducts: ImportExtractedProduct[];
  qualityIssues: ImportQualityIssue[];
  parserIssues: ImportIssue[];
  notes: string[];
  pdfOptions?: PdfImportOptions;
  pdfProgress?: PdfImportProgress;
  sourceFilePath?: string;
  sourceFileSize?: number;
  providerStats?: Record<string, number>;
  pageAudits?: PdfPageAudit[];
  pageAttempts?: Record<string, number>;
  lastError?: string;
}

const rootDir = findWorkspaceRoot(process.cwd());
const dataDir = path.join(rootDir, "data");
const jobsPath = path.join(dataDir, "ai-import-jobs.json");
const jobsLockPath = `${jobsPath}.lock`;
let jobsMutationQueue: Promise<void> = Promise.resolve();

export async function loadImportJobs(): Promise<SmartImportJob[]> {
  await ensureJobsFile();
  return readJson<SmartImportJob[]>(jobsPath, []);
}

export async function getImportJob(jobId: string): Promise<SmartImportJob | null> {
  const jobs = await loadImportJobs();
  return jobs.find((job) => job.id === jobId) ?? null;
}

export async function createXmlImportJob(input: { sourceName: string; fileName?: string; xml: string; actor: string }): Promise<SmartImportJob> {
  const preview = await parseProductXmlBufferPreview(Buffer.from(input.xml), { previewLimit: 500 });
  const store = await loadCatalogStore();
  const extractedProducts = preview.acceptedRows.map((row, index) => toExtractedProduct(row, index + 1, store.products));
  const qualityIssues = extractedProducts.flatMap((product) => qualityIssuesFor(product));
  const job = await saveJob({
    id: `imp-${randomUUID()}`,
    type: "xml",
    status: qualityIssues.some((issue) => issue.severity === "danger") ? "needs_review" : "preview",
    sourceName: clean(input.sourceName) || "XML import",
    fileName: clean(input.fileName) || "xml-import.xml",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    createdBy: input.actor,
    totalRecords: preview.totalRows,
    acceptedRecords: preview.acceptedRows.length,
    extractedProducts,
    qualityIssues,
    parserIssues: preview.issues,
    notes: ["XML kaynağı okundu ve admin onayı için önizleme oluşturuldu."]
  });
  return job;
}

export async function createXmlImportJobFromFile(file: File, actor: string): Promise<SmartImportJob> {
  return createXmlImportJob({
    sourceName: file.name || "XML dosyası",
    fileName: file.name || "xml-import.xml",
    xml: await file.text(),
    actor
  });
}

export async function createPdfImportJobFromFile(file: File, actor: string, options: PdfImportOptions = {}): Promise<SmartImportJob> {
  const maxBytes = Math.max(5, Number(process.env.CATALOG_PDF_MAX_MB) || 120) * 1024 * 1024;
  if (file.size > maxBytes) throw new Error(`PDF en fazla ${Math.round(maxBytes / 1024 / 1024)} MB olabilir.`);
  const jobId = `imp-${randomUUID()}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  const stored = await validateAndStorePdf({ jobId, fileName: file.name || "catalog.pdf", buffer });
  const pdfInfo = await inspectPdf(stored.filePath);
  const startPage = clampInteger(options.startPage, 1, pdfInfo.pageCount, 1);
  const endPage = clampInteger(options.endPage, startPage, pdfInfo.pageCount, pdfInfo.pageCount);
  const now = new Date().toISOString();
  const brandHint = clean(options.brandHint);
  const categoryHint = clean(options.categoryHint);
  const normalizedOptions: PdfImportOptions = {
    sourceName: clean(options.sourceName) || clean(file.name) || "PDF katalog",
    defaultCurrency: normalizeCurrency(options.defaultCurrency) || "TRY",
    startPage,
    endPage,
    ...(brandHint ? { brandHint } : {}),
    ...(categoryHint ? { categoryHint } : {})
  };

  return saveJob({
    id: jobId,
    type: "pdf",
    status: "queued",
    sourceName: normalizedOptions.sourceName || file.name || "PDF katalog",
    fileName: stored.originalFileName,
    createdAt: now,
    updatedAt: now,
    createdBy: actor,
    totalRecords: 0,
    acceptedRecords: 0,
    extractedProducts: [],
    qualityIssues: [],
    parserIssues: [],
    notes: [
      `${pdfInfo.pageCount} sayfalık PDF doğrulandı; ${startPage}-${endPage}. sayfalar analiz kuyruğuna alındı.`,
      "Sayfa görüntüsü ve metin katmanı birlikte analiz edilir; sonuçlar admin onayı olmadan kataloğa aktarılmaz."
    ],
    pdfOptions: normalizedOptions,
    pdfProgress: {
      pageCount: pdfInfo.pageCount,
      startPage,
      endPage,
      processedPages: 0,
      successfulPages: 0,
      failedPages: 0,
      processedPageNumbers: [],
      failedPageNumbers: [],
      percent: 0
    },
    sourceFilePath: stored.filePath,
    sourceFileSize: stored.size,
    providerStats: {},
    pageAudits: [],
    pageAttempts: {}
  });
}

export async function processPdfImportBatch(jobId: string, requestedBatchSize = 1): Promise<SmartImportJob> {
  const existing = await getImportJob(jobId);
  if (!existing || existing.type !== "pdf") throw new Error("PDF import job bulunamadı.");
  if (["approved", "rejected"].includes(existing.status)) throw new Error("Tamamlanmış job yeniden işlenemez.");
  if (!existing.pdfProgress) throw new Error("PDF ilerleme bilgisi eksik.");

  const batchSize = clampInteger(requestedBatchSize, 1, 3, 1);
  const pendingPages = pageRange(existing.pdfProgress.startPage, existing.pdfProgress.endPage)
    .filter((page) => !existing.pdfProgress?.processedPageNumbers.includes(page))
    .slice(0, batchSize);

  if (pendingPages.length === 0) {
    return finalizePdfJob(existing.id);
  }

  await updateJob(jobId, (job) => ({
    ...withoutLastError(job),
    status: "processing",
    updatedAt: new Date().toISOString(),
    ...(job.pdfProgress ? { pdfProgress: { ...job.pdfProgress, currentPage: pendingPages[0]! } } : {})
  }));

  for (const pageNumber of pendingPages) {
    try {
      const current = await getImportJob(jobId);
      if (!current?.pdfProgress) throw new Error("PDF job ilerleme bilgisi kayboldu.");
      const sourcePath = current.sourceFilePath || privatePdfSourcePath(current.id);
      const [rendered, pageText, embeddedImageRegions, embeddedImages, pageWords, catalogStore] = await Promise.all([
        renderPdfPage(current.id, sourcePath, pageNumber),
        extractPdfPageText(sourcePath, pageNumber),
        extractEmbeddedPdfImageRegions(sourcePath, pageNumber),
        extractEmbeddedPdfImages(current.id, sourcePath, pageNumber),
        extractPdfWordBoxes(sourcePath, pageNumber),
        loadCatalogStore()
      ]);

      // Smart page skip — avoid sending cover/index pages to AI
      if (shouldSkipPdfPage(pageText, pageNumber, current.pdfProgress.pageCount) && embeddedImages.length === 0) {
        await updateJob(jobId, (job) => mergeProcessedPdfPage(job, pageNumber, [], {
          provider: "text_fallback",
          model: "page-skip",
          pageBrand: null,
          pageCategory: null,
          pageCurrency: null,
          products: [],
          warnings: [`Sayfa ${pageNumber} kapak/içindekiler/bilgi sayfası olarak otomatik atlandı.`]
        }, "", pageText.length));
        continue;
      }

      const ocrHints = await extractPdfModelOcrHints(rendered.filePath);

      let extraction: CatalogPageExtraction;
      let fallbackError = "";
      const promptImageCandidates = embeddedImageRegions.length <= 20 ? selectPromptImageCandidates(embeddedImageRegions) : [];
      const structuredExtraction = extractStructuredLamindoorPage(pageText, current.sourceName, pageNumber);
      if (structuredExtraction) {
        extraction = structuredExtraction;
      } else {
        try {
          extraction = await extractCatalogPageWithAi({
            imageBase64: rendered.imageBase64,
            coordinateImageBase64: rendered.coordinateImageBase64,
            pageText,
            hints: {
              fileName: current.fileName,
              pageNumber,
              pageCount: current.pdfProgress.pageCount,
              sourceName: current.sourceName,
              ...(current.pdfOptions?.brandHint ? { brandHint: current.pdfOptions.brandHint } : {}),
              ...(current.pdfOptions?.categoryHint ? { categoryHint: current.pdfOptions.categoryHint } : {}),
              ...(current.pdfOptions?.defaultCurrency ? { defaultCurrency: current.pdfOptions.defaultCurrency } : {}),
              ...(ocrHints.modelCandidates.length ? { ocrModelCandidates: ocrHints.modelCandidates } : {}),
              ...(promptImageCandidates.length ? { imageCandidates: promptImageCandidates } : {})
            }
          });
          extraction = reconcileCatalogOcrPhasePairs(
            extraction,
            ocrHints.phasePairs,
            ocrHints.phaseTableDetected ? ocrHints.modelCandidates : []
          );
          extraction = qualifyGenericCatalogModelIdentities(extraction, pageText);
        } catch (error) {
          fallbackError = error instanceof Error ? error.message : "AI sağlayıcı hatası";
          if (process.env.CATALOG_ALLOW_TEXT_FALLBACK !== "true") throw new Error(fallbackError);
          extraction = deterministicPageExtraction(pageText, current, pageNumber, fallbackError);
        }
      }
      extraction = normalizeFloorpanCatalogProducts(extraction, current.sourceName);
      extraction = normalizeLamindoorCatalogProducts(extraction, current.sourceName);

      const preliminaryRegions = extraction.products.map((candidate, index) =>
        resolveProductImageRegion(candidate, index, extraction.products.length, embeddedImageRegions)
      );
      const gridImageRegions = deriveGridProductImageRegions(
        extraction.products.map((candidate, index) => ({
          key: `product-${index + 1}`,
          sku: clean(candidate.sku),
          manufacturerCode: clean(candidate.manufacturerCode),
          name: candidate.name
        })),
        pageWords,
        embeddedImageRegions
      );
      const locatedRegions = new Map<string, CatalogImageRegion | null>();
      const hasImageVerificationConflict = extraction.products.some((candidate) =>
        candidate.warnings.some((warning) => warning.includes("ürün görsel bölgesi farklı bulundu"))
      );
      const hasProviderProductDisagreement =
        (extraction.verification?.openAiOnlyProducts ?? 0) + (extraction.verification?.geminiOnlyProducts ?? 0) > 0;
      const needsImageLocator =
        extraction.provider !== "text_fallback" &&
        extraction.products.length > 0 &&
        gridImageRegions.size < extraction.products.length &&
        (hasImageVerificationConflict || hasProviderProductDisagreement || embeddedImageRegions.length === 0 || embeddedImageRegions.length > 20 || preliminaryRegions.every((region) => !region));
      if (needsImageLocator) {
        try {
          const location = await locateCatalogProductImagesWithAi({
            imageBase64: rendered.imageBase64,
            coordinateImageBase64: rendered.coordinateImageBase64,
            products: extraction.products.map((candidate, index) => ({
              productKey: `product-${index + 1}`,
              sku: clean(candidate.sku) || clean(candidate.manufacturerCode) || `sayfa-${pageNumber}-${index + 1}`,
              name: candidate.name
            })),
            hints: {
              fileName: current.fileName,
              pageNumber,
              pageCount: current.pdfProgress.pageCount,
              sourceName: current.sourceName,
              ...(promptImageCandidates.length ? { imageCandidates: promptImageCandidates } : {})
            }
          });
          for (const match of location.matches) locatedRegions.set(match.productKey, match.imageRegion);
          extraction.warnings.push(...location.warnings, `Görsel eşleştirme: ${location.provider}/${location.model}`);
        } catch (error) {
          extraction.warnings.push(`Görsel eşleştirme uyarısı: ${error instanceof Error ? error.message : "bilinmeyen hata"}`);
        }
      }

      const existingProducts = [...catalogStore.products, ...current.extractedProducts.map((product) => ({ sku: product.sku, name: product.productName }))];
      const products: ImportExtractedProduct[] = [];
      const croppedImagesByRegion = new Map<string, string>();
      const pageHasNoProductImages = catalogWarningsIndicateNoImages(extraction.warnings);
      if (pageHasNoProductImages) {
        extraction.warnings.push("İki bağımsız görsel denetimi sayfada ürün fotoğrafı olmadığını doğruladı; tablo/metin kırpması engellendi.");
      }
      for (const [index, candidate] of extraction.products.entries()) {
        const productKey = `product-${index + 1}`;
        const locatedRegion = locatedRegions.get(productKey) ?? null;
        const selectedRegion = locatedRegion ?? preliminaryRegions[index] ?? null;
        const imageRegion = pageHasNoProductImages
          ? null
          : gridImageRegions.get(productKey) ?? (locatedRegion ? refineLocatedImageRegion(locatedRegion, embeddedImageRegions) : selectedRegion);
        const regionKey = imageRegion ? imageRegionCacheKey(imageRegion) : "";
        // Find the best matching embedded image for this product region
        const matchedEmbeddedImage = imageRegion && extraction.model !== "lamindoor-structured-v1"
          ? findBestEmbeddedImageMatch(imageRegion, embeddedImages)
          : undefined;
        let imageUrl = regionKey ? croppedImagesByRegion.get(regionKey) ?? "" : "";
        if (regionKey && !croppedImagesByRegion.has(regionKey)) {
          imageUrl = await cropCatalogProductImage({
            jobId: current.id,
            pageNumber,
            productIndex: index,
            pageFilePath: rendered.filePath,
            region: imageRegion,
            ...(matchedEmbeddedImage ? { embeddedImage: matchedEmbeddedImage } : {})
          });
          croppedImagesByRegion.set(regionKey, imageUrl);
        }
        if (!imageUrl && pageHasNoProductImages) {
          imageUrl = findInheritedFamilyImage(candidate, current.extractedProducts, pageNumber);
          if (imageUrl) candidate.warnings.push("Ürün fotoğrafı, model ailesi eşleşen önceki katalog sayfasından devralındı.");
        }
        if (matchedEmbeddedImage && imageUrl) {
          candidate.warnings.push(`Orijinal gömülü resim kullanıldı (${matchedEmbeddedImage.originalWidth}×${matchedEmbeddedImage.originalHeight}px, kalite: ${matchedEmbeddedImage.quality}).`);
        }
        products.push(toPdfExtractedProduct(candidate, extraction, current, pageNumber, index, imageUrl, imageRegion, existingProducts));
      }

      await updateJob(jobId, (job) => mergeProcessedPdfPage(job, pageNumber, products, extraction, fallbackError, pageText.length));
    } catch (error) {
      const message = error instanceof Error ? error.message : "PDF sayfası işlenemedi.";
      if (isCatalogQuotaExhaustedError(message)) {
        await updateJob(jobId, (job) => pausePdfJobForQuota(job, pageNumber, message));
        throw new Error(`AI_KOTA_BEKLIYOR: ${message.slice(0, 500)}`);
      }
      const latest = await getImportJob(jobId);
      const nextAttempt = (latest?.pageAttempts?.[String(pageNumber)] ?? 0) + 1;
      const maxAttempts = clampInteger(Number(process.env.CATALOG_PAGE_MAX_ATTEMPTS), 1, 5, 3);
      if (latest && isTransientCatalogAiError(message) && nextAttempt < maxAttempts) {
        await updateJob(jobId, (job) => schedulePdfPageRetry(job, pageNumber, message, nextAttempt));
        continue;
      }
      await updateJob(jobId, (job) => markPdfPageFailed(job, pageNumber, message));
    }
  }

  const current = await getImportJob(jobId);
  if (!current?.pdfProgress) throw new Error("PDF import job bulunamadı.");
  const complete = current.pdfProgress.processedPages >= current.pdfProgress.endPage - current.pdfProgress.startPage + 1;
  return complete
    ? finalizePdfJob(jobId)
    : updateJob(jobId, (job) => {
        const progress = job.pdfProgress ? withoutCurrentPage(job.pdfProgress) : undefined;
        return {
          ...job,
          status: "queued",
          updatedAt: new Date().toISOString(),
          ...(progress ? { pdfProgress: progress } : {})
        };
      });
}

export async function previewImportJob(jobId: string): Promise<SmartImportJob> {
  const job = await getImportJob(jobId);
  if (!job) {
    throw new Error("Import job bulunamadi.");
  }

  return job;
}

export async function resetPdfImportPages(jobId: string, requestedPages: number[]): Promise<SmartImportJob> {
  return updateJob(jobId, (job) => {
    if (job.type !== "pdf" || !job.pdfProgress) throw new Error("PDF import job bulunamadı.");
    if (job.status === "approved" || job.status === "rejected") throw new Error("Tamamlanmış job sayfaları yeniden işlenemez.");
    const pages = uniqueNumbers(requestedPages)
      .filter((page) => page >= job.pdfProgress!.startPage && page <= job.pdfProgress!.endPage);
    if (pages.length === 0) throw new Error("Yeniden işlenecek geçerli sayfa seçilmedi.");
    const pageSet = new Set(pages);
    const extractedProducts = job.extractedProducts.filter((product) => !pageSet.has(product.sourcePage ?? -1));
    const activeProducts = extractedProducts.filter((product) => !product.excluded);
    const pageAudits = (job.pageAudits ?? []).filter((audit) => !pageSet.has(audit.pageNumber));
    const processedPageNumbers = job.pdfProgress.processedPageNumbers.filter((page) => !pageSet.has(page));
    const failedPageNumbers = job.pdfProgress.failedPageNumbers.filter((page) => !pageSet.has(page));
    const pageAttempts = { ...(job.pageAttempts ?? {}) };
    for (const page of pages) delete pageAttempts[String(page)];
    const providerStats: Record<string, number> = {};
    for (const audit of pageAudits) {
      const key = `${audit.provider}:${audit.model}`;
      providerStats[key] = (providerStats[key] ?? 0) + 1;
    }
    const pdfProgress = withPdfProgress(
      job.pdfProgress,
      processedPageNumbers,
      failedPageNumbers,
      processedPageNumbers.length - failedPageNumbers.length
    );

    return stripUndefined({
      ...withoutLastError(job),
      status: "queued",
      updatedAt: new Date().toISOString(),
      totalRecords: extractedProducts.length,
      acceptedRecords: activeProducts.length,
      extractedProducts,
      pageAudits,
      pageAttempts,
      providerStats,
      pdfProgress,
      qualityIssues: [
        ...activeProducts.flatMap((product) => qualityIssuesFor(product)),
        ...pageAudits.flatMap(pageAuditQualityIssues)
      ],
      notes: [`${pages.join(", ")}. sayfalar yeniden işleme kuyruğuna alındı.`, ...job.notes].slice(0, 100)
    }) as SmartImportJob;
  });
}

export async function rejectImportJob(jobId: string, actor: string): Promise<SmartImportJob> {
  return updateJob(jobId, (job) => {
    if (job.status === "approved") throw new Error("Kataloğa aktarılmış job reddedilemez.");
    if (job.status === "rejected") throw new Error("Job daha önce reddedilmiş.");
    return {
      ...job,
      status: "rejected",
      updatedAt: new Date().toISOString(),
      notes: [`${actor} tarafindan reddedildi.`, ...job.notes]
    };
  });
}

export async function updateImportProduct(
  jobId: string,
  productId: string,
  input: {
    sku?: string;
    barcode?: string;
    manufacturerCode?: string;
    productName?: string;
    brandName?: string;
    categoryName?: string;
    listPrice?: string;
    currency?: string;
    taxRate?: string;
    unitType?: string;
    stockQuantity?: number;
    stockStatus?: StockStatus;
    stockQuantityKnown?: boolean;
    description?: string;
    technicalSpecs?: string;
    imageUrl?: string;
    minOrder?: number;
    packageQuantity?: number;
    cartonQuantity?: number;
    palletQuantity?: number;
    warrantyMonths?: number;
    excluded?: boolean;
  }
): Promise<SmartImportJob> {
  return updateJob(jobId, (job) => {
    if (job.status === "approved" || job.status === "rejected") throw new Error("Tamamlanmış job düzenlenemez.");
    const index = job.extractedProducts.findIndex((product) => product.id === productId);
    if (index < 0) throw new Error("Ürün adayı bulunamadı.");
    const current = job.extractedProducts[index]!;
    const productName = clean(input.productName) || current.productName;
    const brandName = clean(input.brandName) || current.brandName;
    const categoryName = clean(input.categoryName) || current.categoryName;
    const listPrice = input.listPrice === undefined ? current.listPrice : normalizeMoney(input.listPrice);
    const imageUrl = input.imageUrl === undefined ? current.imageUrl : clean(input.imageUrl);
    const stockQuantityKnown = input.stockQuantityKnown ?? current.stockQuantityKnown;
    const specifications = input.technicalSpecs === undefined ? current.specifications : parseSpecifications(input.technicalSpecs);
    const next: ImportExtractedProduct = {
      ...current,
      sku: clean(input.sku) || current.sku,
      barcode: input.barcode === undefined ? current.barcode : clean(input.barcode),
      manufacturerCode: input.manufacturerCode === undefined ? current.manufacturerCode : clean(input.manufacturerCode),
      productName,
      brandName,
      categoryName,
      categoryPath: [categoryName],
      listPrice,
      currency: normalizeCurrency(input.currency) || current.currency,
      taxRate: input.taxRate === undefined ? current.taxRate : String(clampNumber(parseLocaleNumber(input.taxRate), 0, 100)),
      unitType: clean(input.unitType) || current.unitType,
      stockQuantity: Math.max(0, input.stockQuantity ?? current.stockQuantity),
      stockStatus: input.stockStatus ?? current.stockStatus,
      stockQuantityKnown,
      imageUrl,
      description: input.description === undefined ? current.description : clean(input.description),
      specifications,
      technicalSpecs: specifications.map((spec) => `${spec.label}: ${spec.value}`).join(" | "),
      minOrder: positiveInteger(input.minOrder ?? current.minOrder, 1),
      packageQuantity: positiveInteger(input.packageQuantity ?? current.packageQuantity, 1),
      cartonQuantity: positiveInteger(input.cartonQuantity ?? current.cartonQuantity, 1),
      palletQuantity: positiveInteger(input.palletQuantity ?? current.palletQuantity, 1),
      warrantyMonths: nonNegativeInteger(input.warrantyMonths ?? current.warrantyMonths, 0),
      missingFields: uniqueStrings([
        ...missingFieldsFor({ productName, brandName, categoryName, listPrice, imageUrl }),
        ...(!stockQuantityKnown ? ["stockQuantity"] : [])
      ]),
      confidenceScore: Math.max(90, current.confidenceScore),
      manuallyReviewed: true,
      excluded: Boolean(input.excluded)
    };
    const extractedProducts = [...job.extractedProducts];
    extractedProducts[index] = next;
    return {
      ...job,
      updatedAt: new Date().toISOString(),
      extractedProducts,
      acceptedRecords: extractedProducts.filter((product) => !product.excluded).length,
      qualityIssues: extractedProducts.filter((product) => !product.excluded).flatMap((product) => qualityIssuesFor(product)),
      notes: [`${next.sku} ürünü admin tarafından gözden geçirildi.`, ...job.notes].slice(0, 100)
    };
  });
}

export async function setImportProductsExcluded(jobId: string, productIds: string[], excluded: boolean): Promise<SmartImportJob> {
  const idSet = new Set(productIds.map(clean).filter(Boolean));
  if (idSet.size === 0) throw new Error("Güncellenecek ürün seçilmedi.");
  return updateJob(jobId, (job) => {
    const matchedCount = job.extractedProducts.filter((product) => idSet.has(product.id)).length;
    if (matchedCount !== idSet.size) throw new Error("Seçilen ürünlerden bazıları import job içinde bulunamadı.");
    const extractedProducts = job.extractedProducts.map((product) =>
      idSet.has(product.id) ? { ...product, excluded } : product
    );
    const activeProducts = extractedProducts.filter((product) => !product.excluded);
    return {
      ...job,
      updatedAt: new Date().toISOString(),
      extractedProducts,
      acceptedRecords: activeProducts.length,
      qualityIssues: [
        ...activeProducts.flatMap((product) => qualityIssuesFor(product)),
        ...(job.pageAudits ?? []).flatMap(pageAuditQualityIssues)
      ],
      notes: [`${matchedCount} ürün ${excluded ? "aktarım dışı bırakıldı" : "yeniden aktarıma alındı"}.`, ...job.notes].slice(0, 100)
    };
  });
}

export async function reviewImportProducts(jobId: string, productIds: string[]): Promise<SmartImportJob> {
  const idSet = new Set(productIds.map(clean).filter(Boolean));
  if (idSet.size === 0) throw new Error("Kontrol edildi işaretlenecek ürün seçilmedi.");
  return updateJob(jobId, (job) => {
    if (job.status === "approved" || job.status === "rejected") throw new Error("Tamamlanmış job ürünleri değiştirilemez.");
    const matchedCount = job.extractedProducts.filter((product) => idSet.has(product.id)).length;
    if (matchedCount !== idSet.size) throw new Error("Seçilen ürünlerden bazıları import job içinde bulunamadı.");
    const extractedProducts = job.extractedProducts.map((product) =>
      idSet.has(product.id)
        ? { ...product, confidenceScore: Math.max(90, product.confidenceScore), manuallyReviewed: true }
        : product
    );
    const activeProducts = extractedProducts.filter((product) => !product.excluded);
    return {
      ...job,
      updatedAt: new Date().toISOString(),
      extractedProducts,
      acceptedRecords: activeProducts.length,
      qualityIssues: [
        ...activeProducts.flatMap((product) => qualityIssuesFor(product)),
        ...(job.pageAudits ?? []).flatMap(pageAuditQualityIssues)
      ],
      notes: [`${matchedCount} ürün tek işlemde admin kontrolünden geçti.`, ...job.notes].slice(0, 100)
    };
  });
}

export async function normalizeFloorpanImportJob(jobId: string): Promise<SmartImportJob> {
  return updateJob(jobId, (job) => {
    if (job.type !== "pdf" || !/floorpan/i.test(job.sourceName)) {
      throw new Error("Bu işlem yalnız Floorpan PDF importları için kullanılabilir.");
    }
    if (job.status === "approved" || job.status === "rejected") {
      throw new Error("Tamamlanmış job normalize edilemez.");
    }
    if (job.status === "queued" || job.status === "processing") {
      throw new Error("PDF sayfaları tamamlanmadan Floorpan job normalize edilemez.");
    }

    let excludedCount = 0;
    const normalizedProducts = job.extractedProducts.map((product) => {
      const code = canonicalFloorpanModelCode(
        product.sku,
        product.manufacturerCode,
        product.sourceRecordId,
        product.productName
      );
      if (!code) {
        excludedCount += 1;
        return {
          ...product,
          excluded: true,
          extractionWarnings: uniqueStrings([
            ...product.extractionWarnings,
            "Açık bir Floorpan dekor kodu bulunmadığı için aktarım dışı bırakıldı."
          ])
        };
      }
      return {
        ...product,
        sourceRecordId: code,
        sku: code,
        manufacturerCode: code,
        excluded: false,
        extractionWarnings: uniqueStrings([
          ...product.extractionWarnings,
          `Floorpan dekor kimliği ${code} olarak kanonikleştirildi.`
        ])
      };
    });
    const extractedProducts = dedupeExtractedProducts(normalizedProducts);
    const activeProducts = extractedProducts.filter((product) => !product.excluded);
    const pageAudits = (job.pageAudits ?? []).map((audit) => {
      const pageProducts = activeProducts.filter((product) => product.sourcePage === audit.pageNumber);
      const imageCounts = new Map<string, number>();
      for (const product of pageProducts) {
        if (product.imageUrl) imageCounts.set(product.imageUrl, (imageCounts.get(product.imageUrl) ?? 0) + 1);
      }
      return {
        ...audit,
        extractedProducts: pageProducts.length,
        productsWithImages: pageProducts.filter((product) => Boolean(product.imageUrl)).length,
        uniqueImages: imageCounts.size,
        sharedImageAssignments: Array.from(imageCounts.values()).reduce((sum, count) => sum + Math.max(0, count - 1), 0)
      };
    });

    return {
      ...job,
      status: "needs_review",
      updatedAt: new Date().toISOString(),
      totalRecords: extractedProducts.length,
      acceptedRecords: activeProducts.length,
      extractedProducts,
      pageAudits,
      qualityIssues: [
        ...activeProducts.flatMap((product) => qualityIssuesFor(product)),
        ...pageAudits.flatMap(pageAuditQualityIssues)
      ],
      notes: uniqueStrings([
        `${activeProducts.length} gerçek Floorpan dekoru kanonik SKU ile tutuldu; ${excludedCount} kodsuz kayıt aktarım dışı bırakıldı.`,
        ...job.notes
      ]).slice(0, 100)
    };
  });
}

export async function refreshImportJobQuality(jobId: string): Promise<SmartImportJob> {
  return updateJob(jobId, (job) => {
    if (job.type !== "pdf") throw new Error("Kalite özeti yalnız PDF importlarında yenilenebilir.");
    const activeProducts = job.extractedProducts.filter((product) => !product.excluded);
    const pageAudits = (job.pageAudits ?? []).map((audit) => {
      const pageProducts = activeProducts.filter((product) => product.sourcePage === audit.pageNumber);
      const productsWithImages = pageProducts.filter((product) => Boolean(product.imageUrl)).length;
      const imageCounts = new Map<string, number>();
      for (const product of pageProducts) {
        if (product.imageUrl) imageCounts.set(product.imageUrl, (imageCounts.get(product.imageUrl) ?? 0) + 1);
      }
      const verifiedStructuredPage = audit.model.endsWith("-structured-v1");
      return {
        ...audit,
        status: audit.status === "failed"
          ? "failed" as const
          : pageProducts.length === 0
            ? "empty" as const
            : verifiedStructuredPage && productsWithImages === pageProducts.length
              ? "ok" as const
              : audit.status,
        extractedProducts: pageProducts.length,
        productsWithImages,
        uniqueImages: imageCounts.size,
        sharedImageAssignments: Array.from(imageCounts.values()).reduce((sum, count) => sum + Math.max(0, count - 1), 0)
      };
    });
    return {
      ...job,
      updatedAt: new Date().toISOString(),
      totalRecords: job.extractedProducts.length,
      acceptedRecords: activeProducts.length,
      pageAudits,
      qualityIssues: [
        ...activeProducts.flatMap((product) => qualityIssuesFor(product)),
        ...pageAudits.flatMap(pageAuditQualityIssues)
      ],
      notes: uniqueStrings(["PDF kalite özeti güncel ürün ve görsel kayıtlarından yeniden hesaplandı.", ...job.notes]).slice(0, 100)
    };
  });
}

export async function approveImportJob(jobId: string, actor: string): Promise<{ job: SmartImportJob; importedCount: number }> {
  const job = await getImportJob(jobId);
  if (!job) {
    throw new Error("Import job bulunamadi.");
  }
  if (job.status === "queued" || job.status === "processing") {
    throw new Error("PDF analizi tamamlanmadan onay verilemez.");
  }
  if (job.status === "approved") throw new Error("Import job daha önce kataloğa aktarılmış.");
  if (job.status === "rejected" || job.status === "failed") throw new Error("Reddedilmiş veya başarısız job kataloğa aktarılamaz.");

  const products = job.extractedProducts.filter(
    (product) => !product.excluded && (product.confidenceScore >= 70 || product.manuallyReviewed) && product.productName && product.brandName
  );
  const importedProducts = products.map((product) => toImportedSupplierProduct(product, job));
  const store = await loadCatalogStore();
  const nextStore = mergeImportedProducts(store, importedProducts, new Date().toISOString());
  await saveCatalogStore(nextStore);
  await appendAuditLogs([createImportAudit(importedProducts.length, actor)]);

  const nextJob = await updateJob(jobId, (current) => ({
    ...current,
    status: "approved",
    updatedAt: new Date().toISOString(),
    notes: [`${importedProducts.length} ürün katalog deposuna taslak olarak aktarıldı.`, ...current.notes]
  }));

  return { job: nextJob, importedCount: importedProducts.length };
}

export async function exportImportJobXml(jobId: string): Promise<string> {
  const job = await getImportJob(jobId);
  if (!job) {
    throw new Error("Import job bulunamadi.");
  }

  const rows = job.extractedProducts
    .map(
      (product) => `  <urun>
    <id>${escapeXml(product.sourceRecordId)}</id>
    <isim><![CDATA[${cdata(product.productName)}]]></isim>
    <marka><![CDATA[${cdata(product.brandName)}]]></marka>
    <resim><![CDATA[${cdata(product.imageUrl)}]]></resim>
    <url><![CDATA[${cdata(product.sourceUrl)}]]></url>
    <kategori_id>${escapeXml(product.categoryName || "0")}</kategori_id>
    <kategori><![CDATA[${cdata(product.categoryName)}]]></kategori>
    <fiyat>${escapeXml(product.listPrice || "0.00")}</fiyat>
    <para_birimi>${escapeXml(product.currency || "TRY")}</para_birimi>
    <birim>${escapeXml(product.unitType || "Adet")}</birim>
    <stok>${escapeXml(String(product.stockQuantity))}</stok>
    <teknik_ozellikler><![CDATA[${cdata(product.technicalSpecs)}]]></teknik_ozellikler>
    ${product.sourcePage ? `<kaynak_pdf_sayfa>${product.sourcePage}</kaynak_pdf_sayfa>` : ""}
    <guven_puani>${product.confidenceScore}</guven_puani>
  </urun>`
    )
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>\n<urunler>\n${rows}\n</urunler>\n`;
}

async function saveJob(job: SmartImportJob): Promise<SmartImportJob> {
  return withJobsMutation(async () => {
    const jobs = await loadImportJobs();
    await writeJson(jobsPath, [job, ...jobs].slice(0, 500));
    return job;
  });
}

async function updateJob(jobId: string, updater: (job: SmartImportJob) => SmartImportJob): Promise<SmartImportJob> {
  return withJobsMutation(async () => {
    const jobs = await loadImportJobs();
    const index = jobs.findIndex((job) => job.id === jobId);
    if (index === -1) {
      throw new Error("Import job bulunamadi.");
    }

    const nextJob = updater(jobs[index]!);
    jobs[index] = nextJob;
    await writeJson(jobsPath, jobs);
    return nextJob;
  });
}

async function withJobsMutation<T>(operation: () => Promise<T>): Promise<T> {
  const previous = jobsMutationQueue;
  let release = (): void => {};
  jobsMutationQueue = new Promise<void>((resolve) => {
    release = resolve;
  });
  await previous;
  let releaseFileLock: (() => Promise<void>) | undefined;
  try {
    releaseFileLock = await acquireJobsFileLock();
    return await operation();
  } finally {
    if (releaseFileLock) await releaseFileLock();
    release();
  }
}

async function acquireJobsFileLock(): Promise<() => Promise<void>> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 30_000) {
    try {
      const handle = await open(jobsLockPath, "wx");
      const lockToken = randomUUID();
      try {
        await handle.writeFile(`${process.pid}\t${lockToken}\t${new Date().toISOString()}\n`);
      } catch (error) {
        await handle.close().catch(() => undefined);
        await unlink(jobsLockPath).catch(() => undefined);
        throw error;
      }
      return async () => {
        await handle.close().catch(() => undefined);
        const currentLock = await readFile(jobsLockPath, "utf8").catch(() => "");
        if (currentLock.split("\t")[1] === lockToken) {
          await unlink(jobsLockPath).catch(() => undefined);
        }
      };
    } catch (error) {
      const code = typeof error === "object" && error !== null && "code" in error ? String(error.code) : "";
      if (code !== "EEXIST") throw error;
      try {
        const lockStat = await stat(jobsLockPath);
        if (Date.now() - lockStat.mtimeMs > 120_000) {
          await unlink(jobsLockPath);
          continue;
        }
      } catch {
        continue;
      }
      await new Promise((resolve) => setTimeout(resolve, 35 + Math.floor(Math.random() * 65)));
    }
  }
  throw new Error("Import job deposu başka bir işlem tarafından uzun süredir kullanılıyor.");
}

function toExtractedProduct(row: ImportedProductRow, index: number, existingProducts: Array<{ sku: string; name: string }>): ImportExtractedProduct {
  const sku = clean(row.sku) || clean(row.externalId) || `AI-${String(index).padStart(6, "0")}`;
  const productName = clean(row.name);
  const brandName = clean(row.brandName) || "Marka Bekliyor";
  const categoryPath = row.categoryPath?.length ? row.categoryPath : [clean(row.categoryName) || "Kategori Bekliyor"];
  const categoryName = clean(row.categoryName) || categoryPath.at(-1) || "Kategori Bekliyor";
  const listPrice = normalizeMoney(row.listPrice);
  const duplicateRisk = existingProducts.some((product) => product.sku === sku) ? "high" : existingProducts.some((product) => normalize(product.name) === normalize(productName)) ? "possible" : "none";
  const missingFields = missingFieldsFor({ productName, brandName, categoryName, listPrice, imageUrl: row.imageUrl });
  const confidenceScore = Math.max(40, 96 - missingFields.length * 9 - (duplicateRisk === "high" ? 18 : duplicateRisk === "possible" ? 9 : 0));

  return {
    id: `prod-${randomUUID()}`,
    sourceRecordId: clean(row.externalId) || sku,
    sku,
    barcode: clean(row.barcode),
    manufacturerCode: clean(row.manufacturerCode),
    productName,
    brandName,
    categoryName,
    categoryPath,
    listPrice,
    currency: clean(row.currency) || "TRY",
    taxRate: clean(row.taxRate) || "20",
    unitType: clean(row.unitType) || "Adet",
    stockQuantity: Math.max(0, Number(row.quantity?.replace(",", ".")) || 0),
    stockStatus: toStockStatus(row.quantity),
    stockQuantityKnown: clean(row.quantity) !== "",
    imageUrl: clean(row.imageUrl),
    sourceUrl: clean(row.sourceUrl),
    description: clean(row.description),
    technicalSpecs: clean(row.description),
    specifications: [],
    minOrder: 1,
    packageQuantity: 1,
    cartonQuantity: 1,
    palletQuantity: 1,
    warrantyMonths: 0,
    extractionWarnings: [],
    confidenceScore,
    duplicateRisk,
    missingFields
  };
}

function extractProductsFromText(text: string, fileName: string): ImportExtractedProduct[] {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter((line) => line.length > 8);
  const products: ImportExtractedProduct[] = [];

  lines.forEach((line, index) => {
    const price = line.match(/(\d{1,6}(?:[.,]\d{1,4})?)\s*(TL|TRY|USD|EUR|€|\$)?/i);
    const uppercaseRatio = line.replace(/[^A-ZÇĞİÖŞÜ]/g, "").length / Math.max(1, line.replace(/[^A-Za-zÇĞİÖŞÜçğıöşü]/g, "").length);
    if (!price || uppercaseRatio < 0.45) {
      return;
    }

    const productName = line.slice(0, Math.min(line.length, 120)).replace(price[0], "").trim();
    if (productName.length < 6) {
      return;
    }

    const currency = currencyFrom(price[2] ?? "");
    const missingFields = missingFieldsFor({ productName, brandName: "Marka Bekliyor", categoryName: "PDF Katalog", listPrice: price[1], imageUrl: "" });
    products.push({
      id: `prod-${randomUUID()}`,
      sourceRecordId: `PDF-${String(index + 1).padStart(6, "0")}`,
      sku: `PDF-${String(index + 1).padStart(6, "0")}`,
      barcode: "",
      manufacturerCode: "",
      productName,
      brandName: "Marka Bekliyor",
      categoryName: "PDF Katalog",
      categoryPath: ["PDF Katalog"],
      listPrice: normalizeMoney(price[1]),
      currency,
      taxRate: "20",
      unitType: "Adet",
      stockQuantity: 0,
      stockStatus: "out_of_stock",
      stockQuantityKnown: false,
      imageUrl: "",
      sourceUrl: fileName,
      description: line,
      technicalSpecs: line,
      specifications: [],
      minOrder: 1,
      packageQuantity: 1,
      cartonQuantity: 1,
      palletQuantity: 1,
      warrantyMonths: 0,
      sourcePage: 1,
      extractionWarnings: ["AI sağlayıcısı olmadan metin katmanından çıkarıldı."],
      confidenceScore: Math.max(45, 82 - missingFields.length * 8),
      duplicateRisk: "none",
      missingFields
    });
  });

  return products.slice(0, 100);
}

function toPdfExtractedProduct(
  candidate: CatalogAiProductCandidate,
  extraction: CatalogPageExtraction,
  job: SmartImportJob,
  pageNumber: number,
  index: number,
  imageUrl: string,
  imageRegion: CatalogImageRegion | null,
  existingProducts: Array<{ sku: string; name: string }>
): ImportExtractedProduct {
  const generatedId = `PDF-${slugPart(job.sourceName).toUpperCase().slice(0, 24)}-${String(pageNumber).padStart(4, "0")}-${String(index + 1).padStart(3, "0")}`;
  const productName = clean(candidate.name);
  const sourceRecordId = clean(candidate.sourceRecordId) || clean(candidate.sku) || clean(candidate.manufacturerCode) || productName || generatedId;
  const sku = clean(candidate.sku) || clean(candidate.manufacturerCode) || sourceRecordId;
  const brandName = clean(candidate.brand) || clean(extraction.pageBrand) || clean(job.pdfOptions?.brandHint) || "Marka Bekliyor";
  const categoryName = clean(candidate.category) || clean(extraction.pageCategory) || clean(job.pdfOptions?.categoryHint) || "PDF Katalog";
  const currency = normalizeCurrency(candidate.currency || extraction.pageCurrency || job.pdfOptions?.defaultCurrency) || "TRY";
  const stockQuantityKnown = candidate.stockQuantity !== null;
  const stockQuantity = stockQuantityKnown ? Math.max(0, candidate.stockQuantity ?? 0) : 0;
  const stockStatus = candidate.stockStatus === "unknown" ? toStockStatus(stockQuantityKnown ? String(stockQuantity) : undefined) : candidate.stockStatus;
  const listPrice = candidate.listPrice === null ? "0.00" : normalizeMoney(String(candidate.listPrice));
  const specifications = candidate.technicalSpecs.filter((spec) => clean(spec.label) && clean(spec.value));
  const technicalSpecs = specifications.map((spec) => `${spec.label}: ${spec.value}`).join(" | ");
  const duplicateRisk = existingProducts.some((product) => product.sku === sku)
    ? "high"
    : existingProducts.some((product) => normalize(product.name) === normalize(productName))
      ? "possible"
      : "none";
  const missingFields = missingFieldsFor({ productName, brandName, categoryName, listPrice, imageUrl });
  if (!stockQuantityKnown) missingFields.push("stockQuantity");
  const extractionWarnings = uniqueStrings([
    ...candidate.warnings,
    ...extraction.warnings,
    ...(!stockQuantityKnown ? ["Katalogda gerçek stok adedi bulunamadı; stok teyidi gerekli olarak işaretlendi."] : [])
  ]);
  const confidenceScore = Math.round(clampNumber(candidate.confidence - (imageUrl ? 0 : 4) - (duplicateRisk === "high" ? 12 : duplicateRisk === "possible" ? 5 : 0), 0, 100));

  return {
    id: `prod-${randomUUID()}`,
    sourceRecordId,
    sku,
    barcode: clean(candidate.barcode),
    manufacturerCode: clean(candidate.manufacturerCode),
    productName,
    brandName,
    categoryName,
    categoryPath: [categoryName],
    listPrice,
    currency,
    taxRate: candidate.taxRate === null ? "20" : String(clampNumber(candidate.taxRate, 0, 100)),
    unitType: clean(candidate.unitType) || "Adet",
    stockQuantity,
    stockStatus,
    stockQuantityKnown,
    imageUrl,
    sourceUrl: `${job.fileName}#page=${pageNumber}`,
    description: clean(candidate.description),
    technicalSpecs,
    specifications,
    minOrder: positiveInteger(candidate.minOrder, 1),
    packageQuantity: positiveInteger(candidate.packageQuantity, 1),
    cartonQuantity: positiveInteger(candidate.cartonQuantity, 1),
    palletQuantity: positiveInteger(candidate.palletQuantity, 1),
    warrantyMonths: nonNegativeInteger(candidate.warrantyMonths, 0),
    sourcePage: pageNumber,
    ...(imageRegion ? { imageRegion } : {}),
    extractionWarnings,
    confidenceScore,
    duplicateRisk,
    missingFields: uniqueStrings(missingFields)
  };
}

function resolveProductImageRegion(
  candidate: CatalogAiProductCandidate,
  productIndex: number,
  productCount: number,
  embeddedRegions: EmbeddedPdfImageRegion[]
): CatalogImageRegion | null {
  if (embeddedRegions.length > 20) {
    return candidate.imageRegion;
  }

  if (embeddedRegions.length === productCount) {
    const matchingRegion = embeddedRegions[productIndex]?.region;
    if (!candidate.imageRegion || (matchingRegion && embeddedRegionCanReplaceTarget(candidate.imageRegion, matchingRegion))) {
      return matchingRegion ?? candidate.imageRegion;
    }
    return candidate.imageRegion;
  }

  if (candidate.imageCandidateIndex !== null) {
    const selected = embeddedRegions.find((entry) => entry.index === candidate.imageCandidateIndex);
    if (selected && (!candidate.imageRegion || embeddedRegionCanReplaceTarget(candidate.imageRegion, selected.region))) {
      return selected.region;
    }
  }

  if (embeddedRegions.length > 12 || embeddedRegions.length > productCount * 2) {
    return candidate.imageRegion;
  }

  if (candidate.imageRegion && embeddedRegions.length) {
    const centerX = candidate.imageRegion.x + candidate.imageRegion.width / 2;
    const centerY = candidate.imageRegion.y + candidate.imageRegion.height / 2;
    const nearest = embeddedRegions
      .filter((entry) => embeddedRegionCanReplaceTarget(candidate.imageRegion!, entry.region))
      .map((entry) => {
        const candidateX = entry.region.x + entry.region.width / 2;
        const candidateY = entry.region.y + entry.region.height / 2;
        return { entry, distance: Math.hypot(centerX - candidateX, centerY - candidateY) };
      })
      .sort((a, b) => a.distance - b.distance)[0];
    if (nearest && nearest.distance <= 180) return nearest.entry.region;
  }

  return candidate.imageRegion;
}

function selectPromptImageCandidates(regions: EmbeddedPdfImageRegion[]): EmbeddedPdfImageRegion[] {
  return regions
    .filter((entry) => {
      const { width, height } = entry.region;
      const area = width * height;
      const ratio = width / height;
      return area >= 8_000 && area <= 180_000 && width >= 60 && height >= 40 && ratio >= 0.25 && ratio <= 3.5;
    })
    .sort((a, b) => b.region.width * b.region.height - a.region.width * a.region.height)
    .slice(0, 12)
    .sort((a, b) => a.region.y - b.region.y || a.region.x - b.region.x);
}

function refineLocatedImageRegion(region: CatalogImageRegion | null, embeddedRegions: EmbeddedPdfImageRegion[]): CatalogImageRegion | null {
  if (!region || embeddedRegions.length === 0) return region;
  const matches = embeddedRegions
    .filter((entry) => {
      const candidate = entry.region;
      const centerX = candidate.x + candidate.width / 2;
      const centerY = candidate.y + candidate.height / 2;
      const area = candidate.width * candidate.height;
      const ratio = candidate.width / candidate.height;
      return (
        embeddedRegionCanReplaceTarget(region, candidate) &&
        centerX >= region.x &&
        centerX <= region.x + region.width &&
        centerY >= region.y &&
        centerY <= region.y + region.height &&
        area >= 2_000 &&
        area <= 180_000 &&
        ratio >= 0.2 &&
        ratio <= 4
      );
    })
    .sort((a, b) => {
      const regionCenterX = region.x + region.width / 2;
      const regionCenterY = region.y + region.height / 2;
      const aDistance = Math.hypot(a.region.x + a.region.width / 2 - regionCenterX, a.region.y + a.region.height / 2 - regionCenterY);
      const bDistance = Math.hypot(b.region.x + b.region.width / 2 - regionCenterX, b.region.y + b.region.height / 2 - regionCenterY);
      return aDistance - bDistance || b.region.width * b.region.height - a.region.width * a.region.height;
    });
  if (matches.length === 0) return region;
  return matches[0]!.region;
}

function imageRegionCacheKey(region: CatalogImageRegion): string {
  const rounded = [region.x, region.y, region.width, region.height].map((value) => Math.round(value / 4) * 4);
  return rounded.join(":");
}

function findBestEmbeddedImageMatch(region: CatalogImageRegion, embeddedImages: ExtractedEmbeddedImage[]): ExtractedEmbeddedImage | undefined {
  if (embeddedImages.length === 0) return undefined;
  const regionCenterX = region.x + region.width / 2;
  const regionCenterY = region.y + region.height / 2;
  const candidates = embeddedImages
    .filter((image) => {
      if (!embeddedRegionCanReplaceTarget(region, image.region)) return false;
      const imageCenterX = image.region.x + image.region.width / 2;
      const imageCenterY = image.region.y + image.region.height / 2;
      const distance = Math.hypot(regionCenterX - imageCenterX, regionCenterY - imageCenterY);
      // Accept embedded images whose center is within reasonable distance of the target region
      return distance <= Math.max(120, Math.min(region.width, region.height) * 0.7);
    })
    .sort((a, b) => {
      // Prefer higher quality, then closer distance
      if (b.quality !== a.quality) return b.quality - a.quality;
      const aDist = Math.hypot(regionCenterX - (a.region.x + a.region.width / 2), regionCenterY - (a.region.y + a.region.height / 2));
      const bDist = Math.hypot(regionCenterX - (b.region.x + b.region.width / 2), regionCenterY - (b.region.y + b.region.height / 2));
      return aDist - bDist;
    });
  return candidates[0];
}

function embeddedRegionCanReplaceTarget(target: CatalogImageRegion, candidate: CatalogImageRegion): boolean {
  const left = Math.max(target.x, candidate.x);
  const top = Math.max(target.y, candidate.y);
  const right = Math.min(target.x + target.width, candidate.x + candidate.width);
  const bottom = Math.min(target.y + target.height, candidate.y + candidate.height);
  const intersection = Math.max(0, right - left) * Math.max(0, bottom - top);
  const targetArea = target.width * target.height;
  if (targetArea <= 0) return false;
  return (
    candidate.width >= target.width * 0.55 &&
    candidate.height >= target.height * 0.55 &&
    candidate.width <= target.width * 1.5 &&
    candidate.height <= target.height * 1.5 &&
    intersection / targetArea >= 0.35
  );
}

function findInheritedFamilyImage(
  candidate: CatalogAiProductCandidate,
  existingProducts: ImportExtractedProduct[],
  pageNumber: number
): string {
  const candidateValues = [candidate.sku, candidate.manufacturerCode, candidate.sourceRecordId, candidate.name]
    .map((value) => modelFamilyStem(value ?? ""))
    .filter((value) => value.length >= 4);
  if (candidateValues.length === 0) return "";

  const matches = existingProducts
    .filter((product) => product.imageUrl && product.sourcePage && product.sourcePage < pageNumber && product.sourcePage >= pageNumber - 2)
    .map((product) => {
      const productValues = [product.sku, product.manufacturerCode, product.sourceRecordId, product.productName]
        .map(modelFamilyStem)
        .filter((value) => value.length >= 4);
      const score = Math.max(0, ...candidateValues.flatMap((candidateValue) =>
        productValues.map((productValue) => candidateValue === productValue ? 100 : commonPrefixLength(candidateValue, productValue))
      ));
      return { product, score };
    })
    .filter((entry) => entry.score >= 4)
    .sort((a, b) => b.score - a.score || (b.product.sourcePage ?? 0) - (a.product.sourcePage ?? 0));
  if (matches[0]?.product.imageUrl) return matches[0].product.imageUrl;

  for (const sourcePage of [pageNumber - 1, pageNumber - 2]) {
    const pageProducts = existingProducts.filter((product) => product.sourcePage === sourcePage && product.imageUrl);
    const imageUrls = new Set(pageProducts.map((product) => product.imageUrl));
    if (pageProducts.length < 2 || imageUrls.size !== 1) continue;
    const broadScore = Math.max(0, ...candidateValues.flatMap((candidateValue) =>
      pageProducts.flatMap((product) =>
        [product.sku, product.manufacturerCode, product.sourceRecordId, product.productName]
          .map(modelFamilyStem)
          .filter((value) => value.length >= 4)
          .map((productValue) => commonPrefixLength(candidateValue, productValue))
      )
    ));
    const broadPrefix = candidateValues[0]!.slice(0, broadScore);
    if (broadScore >= 3 && /\d/.test(broadPrefix)) return pageProducts[0]!.imageUrl;
  }

  return "";
}

function modelFamilyStem(value: string): string {
  const cleaned = value
    .toLocaleUpperCase("tr-TR")
    .replace(/İ/g, "I")
    .replace(/\(M\)/g, "M")
    .replace(/[^A-Z0-9/-]+/g, "")
    .replace(/STM/g, "ST");
  return cleaned.replace(/[-/]\d+(?:[A-Z])?$/, "");
}

function commonPrefixLength(left: string, right: string): number {
  const limit = Math.min(left.length, right.length);
  let index = 0;
  while (index < limit && left[index] === right[index]) index += 1;
  return index;
}

function deterministicPageExtraction(pageText: string, job: SmartImportJob, pageNumber: number, reason: string): CatalogPageExtraction {
  const lines = pageText
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter((line) => line.length >= 8);
  const products: CatalogAiProductCandidate[] = [];

  for (const [index, line] of lines.entries()) {
    const price = findExplicitPrice(line);
    if (!price) continue;
    const withoutPrice = line.replace(price.raw, " ").replace(/\s+/g, " ").trim();
    const skuMatch = withoutPrice.match(/\b(?=[A-Z0-9._/-]*\d)[A-Z0-9][A-Z0-9._/-]{2,}\b/i);
    const sku = skuMatch?.[0] ?? null;
    const name = withoutPrice.replace(sku ?? "", " ").replace(/\s+/g, " ").trim().slice(0, 180);
    if (name.length < 5) continue;

    products.push({
      sourceRecordId: sku || `PDF-P${pageNumber}-${index + 1}`,
      sku,
      barcode: null,
      manufacturerCode: sku,
      name,
      brand: clean(job.pdfOptions?.brandHint) || null,
      category: clean(job.pdfOptions?.categoryHint) || "PDF Katalog",
      description: line,
      listPrice: price.amount,
      currency: price.currency || normalizeCurrency(job.pdfOptions?.defaultCurrency) || "TRY",
      taxRate: null,
      unitType: null,
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
      confidence: 42,
      warnings: ["AI görüntü analizi kullanılamadı; yalnızca PDF metin katmanından düşük güvenle çıkarıldı."]
    });
  }

  return {
    provider: "text_fallback",
    model: "poppler-layout-text",
    pageBrand: clean(job.pdfOptions?.brandHint) || null,
    pageCategory: clean(job.pdfOptions?.categoryHint) || null,
    pageCurrency: normalizeCurrency(job.pdfOptions?.defaultCurrency) || "TRY",
    products: products.slice(0, 80),
    warnings: [reason.slice(0, 400)]
  };
}

function mergeProcessedPdfPage(
  job: SmartImportJob,
  pageNumber: number,
  pageProducts: ImportExtractedProduct[],
  extraction: CatalogPageExtraction,
  fallbackError: string,
  textCharacters: number
): SmartImportJob {
  if (!job.pdfProgress) return job;
  const extractedProducts = dedupeExtractedProducts([...job.extractedProducts, ...pageProducts]);
  const activeProducts = extractedProducts.filter((product) => !product.excluded);
  const processedPageNumbers = uniqueNumbers([...job.pdfProgress.processedPageNumbers, pageNumber]);
  const successfulPages = job.pdfProgress.successfulPages + 1;
  const progress = withPdfProgress(job.pdfProgress, processedPageNumbers, job.pdfProgress.failedPageNumbers, successfulPages);
  const providerStats = { ...(job.providerStats ?? {}) };
  providerStats[`${extraction.provider}:${extraction.model}`] = (providerStats[`${extraction.provider}:${extraction.model}`] ?? 0) + 1;
  const pageAudit = createPdfPageAudit(pageNumber, pageProducts, extraction, fallbackError, textCharacters);
  const pageAudits = upsertPageAudit(job.pageAudits ?? [], pageAudit);
  const qualityIssues = [
    ...activeProducts.flatMap((product) => qualityIssuesFor(product)),
    ...pageAudits.flatMap(pageAuditQualityIssues)
  ];
  for (const warning of extraction.warnings.slice(0, 5)) {
    qualityIssues.push({
      id: `issue-${randomUUID()}`,
      severity: extraction.provider === "text_fallback" && !isVerifiedStructuredExtraction(extraction) ? "warning" : "info",
      field: `page.${pageNumber}`,
      message: warning
    });
  }

  return stripUndefined({
    ...job,
    status: "processing",
    updatedAt: new Date().toISOString(),
    totalRecords: extractedProducts.length,
    acceptedRecords: activeProducts.length,
    extractedProducts,
    qualityIssues,
    pdfProgress: progress,
    providerStats,
    pageAudits,
    notes: [
      `Sayfa ${pageNumber}: ${pageProducts.length} ürün adayı çıkarıldı (${extraction.provider}/${extraction.model}).`,
      ...(fallbackError ? [`Sayfa ${pageNumber} AI uyarısı: ${fallbackError.slice(0, 300)}`] : []),
      ...job.notes
    ].slice(0, 100),
    lastError: fallbackError || undefined
  }) as SmartImportJob;
}

function createPdfPageAudit(
  pageNumber: number,
  products: ImportExtractedProduct[],
  extraction: CatalogPageExtraction,
  fallbackError: string,
  textCharacters: number
): PdfPageAudit {
  const imageUrls = products.map((product) => product.imageUrl).filter(Boolean);
  const uniqueImages = new Set(imageUrls).size;
  const singleProviderProducts = (extraction.verification?.openAiOnlyProducts ?? 0) + (extraction.verification?.geminiOnlyProducts ?? 0);
  const conflicts = extraction.verification?.conflictingProducts ?? 0;
  const missingImages = products.length - imageUrls.length;
  const verifiedStructuredExtraction = isVerifiedStructuredExtraction(extraction);
  const needsReview =
    Boolean(fallbackError) ||
    (extraction.provider !== "consensus" && !verifiedStructuredExtraction) ||
    singleProviderProducts > 0 ||
    conflicts > 0 ||
    missingImages > 0;
  const messages = uniqueStrings([
    ...extraction.warnings,
    ...(fallbackError ? [fallbackError] : []),
    ...(singleProviderProducts ? [`${singleProviderProducts} ürün satırı yalnızca bir AI sağlayıcısı tarafından bulundu.`] : []),
    ...(conflicts ? [`${conflicts} ürün kaydında sağlayıcılar arasında alan farkı var.`] : []),
    ...(missingImages ? [`${missingImages} ürün için doğrulanmış görsel bulunamadı.`] : [])
  ]).slice(0, 20);

  return {
    pageNumber,
    status: products.length === 0 ? "empty" : needsReview ? "needs_review" : "ok",
    provider: extraction.provider,
    model: extraction.model,
    textCharacters,
    extractedProducts: products.length,
    productsWithImages: imageUrls.length,
    uniqueImages,
    sharedImageAssignments: Math.max(0, imageUrls.length - uniqueImages),
    warningCount: messages.length + products.reduce((sum, product) => sum + product.extractionWarnings.length, 0),
    ...(extraction.verification ? { verification: extraction.verification } : {}),
    messages
  };
}

function isVerifiedStructuredExtraction(extraction: CatalogPageExtraction): boolean {
  return extraction.model.endsWith("-structured-v1");
}

function upsertPageAudit(audits: PdfPageAudit[], audit: PdfPageAudit): PdfPageAudit[] {
  return [...audits.filter((entry) => entry.pageNumber !== audit.pageNumber), audit].sort((a, b) => a.pageNumber - b.pageNumber);
}

function pageAuditQualityIssues(audit: PdfPageAudit): ImportQualityIssue[] {
  const issues: ImportQualityIssue[] = [];
  const singleProviderProducts = (audit.verification?.openAiOnlyProducts ?? 0) + (audit.verification?.geminiOnlyProducts ?? 0);
  if (audit.status === "failed") {
    issues.push({
      id: `issue-${randomUUID()}`,
      severity: "danger",
      field: `page.${audit.pageNumber}`,
      message: audit.messages[0] || "PDF sayfası işlenemedi."
    });
  } else if (audit.status === "empty" && audit.textCharacters > 250) {
    issues.push({
      id: `issue-${randomUUID()}`,
      severity: "info",
      field: `page.${audit.pageNumber}`,
      message: "Metin içeren bu sayfada ürün adayı bulunmadı; kapak/içindekiler veya olası eksik çıkarım olarak kontrol edin."
    });
  }
  if (singleProviderProducts > 0 || (audit.verification?.conflictingProducts ?? 0) > 0) {
    issues.push({
      id: `issue-${randomUUID()}`,
      severity: "warning",
      field: `page.${audit.pageNumber}.verification`,
      message: `${singleProviderProducts} tek-sağlayıcı ürün, ${audit.verification?.conflictingProducts ?? 0} çatışmalı ürün var.`
    });
  }
  const missingImages = audit.extractedProducts - audit.productsWithImages;
  if (missingImages > 0) {
    issues.push({
      id: `issue-${randomUUID()}`,
      severity: "warning",
      field: `page.${audit.pageNumber}.images`,
      message: `${missingImages} ürün için görsel eşleştirmesi kontrol edilmeli.`
    });
  }
  return issues;
}

function schedulePdfPageRetry(job: SmartImportJob, pageNumber: number, message: string, attempt: number): SmartImportJob {
  return {
    ...job,
    status: "queued",
    updatedAt: new Date().toISOString(),
    lastError: `Sayfa ${pageNumber} geçici sağlayıcı hatası nedeniyle yeniden denenecek: ${message.slice(0, 350)}`,
    pageAttempts: { ...(job.pageAttempts ?? {}), [String(pageNumber)]: attempt },
    notes: [`Sayfa ${pageNumber} geçici API hatası aldı; ${attempt + 1}. deneme planlandı.`, ...job.notes].slice(0, 100),
    ...(job.pdfProgress ? { pdfProgress: withoutCurrentPage(job.pdfProgress) } : {})
  };
}

function isTransientCatalogAiError(message: string): boolean {
  return /fetch failed|network|timeout|timed out|high demand|temporar|rate limit|overloaded|try again|ECONNRESET|ENOTFOUND/i.test(message);
}

function isCatalogQuotaExhaustedError(message: string): boolean {
  return /exceeded your current quota|insufficient[_ -]?quota|quota.{0,30}(?:exhausted|exceeded)|billing details|resource[_ -]?exhausted/i.test(message);
}

function pausePdfJobForQuota(job: SmartImportJob, pageNumber: number, message: string): SmartImportJob {
  return {
    ...job,
    status: "queued",
    updatedAt: new Date().toISOString(),
    lastError: `AI sağlayıcı kotası dolu; sayfa ${pageNumber} işlenmeden kuyruk korundu. ${message.slice(0, 350)}`,
    notes: uniqueStrings([
      `Sayfa ${pageNumber} öncesinde AI kotası doldu; kredi/kota yenilendiğinde aynı sayfadan devam edilecek.`,
      ...job.notes
    ]).slice(0, 100),
    ...(job.pdfProgress ? { pdfProgress: withoutCurrentPage(job.pdfProgress) } : {})
  };
}

function catalogWarningsIndicateNoImages(warnings: string[]): boolean {
  const signals = warnings.filter((warning) =>
    /(?:sayfada\s+)?(?:uygun\s+|gerçek\s+)?ürün (?:fotoğrafı|görseli)\s+(?:yok|görünmüyor|bulunmuyor|bulunamadı)|(?:no|without) product images?|no product (?:photo|image)s?\s+(?:found|visible|available)/i.test(warning)
  );
  return signals.length >= 1;
}

function markPdfPageFailed(job: SmartImportJob, pageNumber: number, message: string): SmartImportJob {
  if (!job.pdfProgress) return job;
  const processedPageNumbers = uniqueNumbers([...job.pdfProgress.processedPageNumbers, pageNumber]);
  const failedPageNumbers = uniqueNumbers([...job.pdfProgress.failedPageNumbers, pageNumber]);
  const pageAudits = upsertPageAudit(job.pageAudits ?? [], {
    pageNumber,
    status: "failed",
    provider: "text_fallback",
    model: "none",
    textCharacters: 0,
    extractedProducts: 0,
    productsWithImages: 0,
    uniqueImages: 0,
    sharedImageAssignments: 0,
    warningCount: 1,
    messages: [message.slice(0, 500)]
  });
  return {
    ...job,
    status: "processing",
    updatedAt: new Date().toISOString(),
    lastError: message.slice(0, 500),
    pdfProgress: withPdfProgress(job.pdfProgress, processedPageNumbers, failedPageNumbers, job.pdfProgress.successfulPages),
    pageAudits,
    qualityIssues: [
      ...job.qualityIssues,
      { id: `issue-${randomUUID()}`, severity: "danger", field: `page.${pageNumber}`, message: message.slice(0, 500) }
    ],
    notes: [`Sayfa ${pageNumber} işlenemedi: ${message.slice(0, 300)}`, ...job.notes].slice(0, 100)
  };
}

async function finalizePdfJob(jobId: string): Promise<SmartImportJob> {
  return updateJob(jobId, (job) => {
    if (!job.pdfProgress) return job;
    const { currentPage: _currentPage, ...progress } = job.pdfProgress;
    const activeProductCount = job.extractedProducts.filter((product) => !product.excluded).length;
    const status: SmartImportStatus = activeProductCount > 0 ? "needs_review" : "failed";
    return {
      ...job,
      status,
      updatedAt: new Date().toISOString(),
      pdfProgress: { ...progress, percent: 100 },
      notes: uniqueStrings([
        status === "failed"
          ? "PDF analizi tamamlandı fakat ürün adayı çıkarılamadı; sayfa hatalarını ve AI sağlayıcı ayarlarını kontrol edin."
          : `${activeProductCount} aktif ürün adayı çıkarıldı; yayın öncesi admin veri kontrolü bekliyor.`,
        ...job.notes
      ]).slice(0, 100)
    };
  });
}

function withPdfProgress(
  progress: PdfImportProgress,
  processedPageNumbers: number[],
  failedPageNumbers: number[],
  successfulPages: number
): PdfImportProgress {
  const total = progress.endPage - progress.startPage + 1;
  const { currentPage: _currentPage, ...rest } = progress;
  return {
    ...rest,
    processedPageNumbers,
    failedPageNumbers,
    processedPages: processedPageNumbers.length,
    successfulPages,
    failedPages: failedPageNumbers.length,
    percent: Math.min(100, Math.round((processedPageNumbers.length / total) * 100))
  };
}

function dedupeExtractedProducts(products: ImportExtractedProduct[]): ImportExtractedProduct[] {
  const byKey = new Map<string, ImportExtractedProduct>();
  for (const product of products) {
    const commercialVariantKey = commercialPowerVariantKey(product);
    const key = commercialVariantKey || (clean(product.sku) ? `sku:${normalize(product.sku)}` : `source:${product.sourcePage ?? 0}:${normalize(product.sourceRecordId)}`);
    const existing = byKey.get(key);
    if (!existing || shouldReplaceDedupedProduct(existing, product)) byKey.set(key, product);
  }
  return Array.from(byKey.values()).sort((a, b) => (a.sourcePage ?? 0) - (b.sourcePage ?? 0) || a.productName.localeCompare(b.productName, "tr"));
}

function shouldReplaceDedupedProduct(existing: ImportExtractedProduct, candidate: ImportExtractedProduct): boolean {
  if (Boolean(existing.excluded) !== Boolean(candidate.excluded)) return !candidate.excluded;
  if (Boolean(existing.manuallyReviewed) !== Boolean(candidate.manuallyReviewed)) return Boolean(candidate.manuallyReviewed);
  if (Boolean(clean(existing.imageUrl)) !== Boolean(clean(candidate.imageUrl))) return Boolean(clean(candidate.imageUrl));
  return candidate.confidenceScore > existing.confidenceScore;
}

function commercialPowerVariantKey(product: ImportExtractedProduct): string {
  if (!product.sourcePage || !/motor/i.test(product.productName)) return "";
  const text = `${product.sku} ${product.productName}`;
  const match = text.match(/(\d+(?:[.,]\d+)?)\s*(?:kW)?[^0-9]{0,8}\(?\s*(220|380)\s*[WV]\)?/i);
  if (!match?.[1] || !match[2]) return "";
  const power = Number(match[1].replace(",", "."));
  if (!Number.isFinite(power)) return "";
  return `power:${product.sourcePage}:${power}:${match[2]}`;
}

function findExplicitPrice(line: string): { raw: string; amount: number; currency: string } | null {
  const match = line.match(/(?:\b(TL|TRY|USD|EUR)\b|[₺$€])?\s*(\d{1,3}(?:[.\s]\d{3})*(?:,\d{1,4})|\d{1,6}[.,]\d{2,4})\s*(TL|TRY|USD|EUR|₺|\$|€)?/i);
  if (!match) return null;
  const currencyToken = match[1] || match[3] || "";
  if (!currencyToken && !/[.,]\d{2,4}\b/.test(match[2] ?? "")) return null;
  const amount = parseLocaleNumber(match[2] ?? "");
  if (!Number.isFinite(amount) || amount <= 0) return null;
  return { raw: match[0], amount, currency: normalizeCurrency(currencyToken) };
}

function qualityIssuesFor(product: ImportExtractedProduct): ImportQualityIssue[] {
  const issues: ImportQualityIssue[] = product.missingFields.map((field) => ({
    id: `issue-${randomUUID()}`,
    severity: field === "productName" ? "danger" : "warning",
    field,
    message: `${field} alanı eksik veya kontrol bekliyor.`,
    productId: product.id
  }));

  if (product.duplicateRisk !== "none") {
    issues.push({
      id: `issue-${randomUUID()}`,
      severity: product.duplicateRisk === "high" ? "danger" : "warning",
      field: "duplicate",
      message: product.duplicateRisk === "high" ? "Aynı SKU mevcut katalogda var." : "Benzer ürün adı mevcut olabilir.",
      productId: product.id
    });
  }

  if (product.confidenceScore < 70) {
    issues.push({
      id: `issue-${randomUUID()}`,
      severity: "danger",
      field: "confidenceScore",
      message: "Güven puanı 70 altında; otomatik aktarım yapılmamalı.",
      productId: product.id
    });
  }

  for (const warning of product.extractionWarnings.slice(0, 3)) {
    issues.push({
      id: `issue-${randomUUID()}`,
      severity: "info",
      field: "extraction",
      message: warning,
      productId: product.id
    });
  }

  return issues;
}

function toImportedSupplierProduct(product: ImportExtractedProduct, job: SmartImportJob): ImportedSupplierProduct {
  return stripUndefined({
    sourceKey: `catalog-${slugPart(job.sourceName)}`,
    sourceName: job.sourceName,
    externalId: product.sourceRecordId,
    sku: product.sku,
    barcode: product.barcode || undefined,
    manufacturerCode: product.manufacturerCode || undefined,
    productName: product.productName,
    brandName: product.brandName,
    categoryPath: product.categoryPath.length ? product.categoryPath : [product.categoryName],
    categoryName: product.categoryName,
    unitType: product.unitType,
    taxRate: product.taxRate,
    currency: product.currency,
    listPrice: product.listPrice,
    stockQuantity: product.stockQuantity,
    stockStatus: product.stockStatus,
    stockQuantityKnown: product.stockQuantityKnown,
    description: product.description || undefined,
    technicalSpecs: product.specifications.length ? product.specifications : undefined,
    minOrder: product.minOrder,
    packageQuantity: product.packageQuantity,
    cartonQuantity: product.cartonQuantity,
    palletQuantity: product.palletQuantity,
    warrantyMonths: product.warrantyMonths,
    imageUrl: product.imageUrl || undefined,
    sourceUrl: product.sourceUrl || undefined,
    priceVisibleToPublic: false
  }) as ImportedSupplierProduct;
}

function missingFieldsFor(input: {
  productName?: string | undefined;
  brandName?: string | undefined;
  categoryName?: string | undefined;
  listPrice?: string | undefined;
  imageUrl?: string | undefined;
}): string[] {
  const missing: string[] = [];
  if (!clean(input.productName)) missing.push("productName");
  if (!clean(input.brandName) || clean(input.brandName) === "Marka Bekliyor") missing.push("brandName");
  if (!clean(input.categoryName) || clean(input.categoryName) === "Kategori Bekliyor") missing.push("categoryName");
  if (Number(normalizeMoney(input.listPrice)) <= 0) missing.push("listPrice");
  if (!clean(input.imageUrl)) missing.push("imageUrl");
  return missing;
}

function normalizeMoney(value?: string): string {
  const amount = parseLocaleNumber(clean(value));
  return Number.isFinite(amount) ? amount.toFixed(2) : "0.00";
}

function toStockStatus(quantity?: string): StockStatus {
  const value = Number(clean(quantity).replace(",", "."));
  if (!Number.isFinite(value) || value <= 0) {
    return "out_of_stock";
  }
  return value < 5 ? "low_stock" : "in_stock";
}

function currencyFrom(value: string): string {
  return normalizeCurrency(value) || "TRY";
}

function normalizeCurrency(value: unknown): string {
  const normalized = clean(value).toUpperCase();
  if (!normalized) return "";
  if (normalized.includes("USD") || normalized.includes("$")) return "USD";
  if (normalized.includes("EUR") || normalized.includes("€")) return "EUR";
  if (normalized.includes("GBP") || normalized.includes("£")) return "GBP";
  if (normalized.includes("TRY") || normalized.includes("TL") || normalized.includes("₺")) return "TRY";
  return normalized.slice(0, 8);
}

function parseLocaleNumber(value: string): number {
  const compact = value.replace(/\s/g, "").replace(/[^0-9,.-]/g, "");
  if (!compact) return Number.NaN;
  const lastComma = compact.lastIndexOf(",");
  const lastDot = compact.lastIndexOf(".");
  if (lastComma >= 0 && lastDot >= 0) {
    const decimal = lastComma > lastDot ? "," : ".";
    const thousands = decimal === "," ? /\./g : /,/g;
    return Number(compact.replace(thousands, "").replace(decimal, "."));
  }
  if (lastComma >= 0) return Number(compact.replace(/\./g, "").replace(",", "."));
  if ((compact.match(/\./g) ?? []).length > 1) return Number(compact.replace(/\./g, ""));
  return Number(compact);
}

function clampInteger(value: unknown, min: number, max: number, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.round(clampNumber(parsed, min, max)) : fallback;
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function positiveInteger(value: number | null, fallback: number): number {
  return value !== null && Number.isFinite(value) && value > 0 ? Math.max(1, Math.round(value)) : fallback;
}

function nonNegativeInteger(value: number | null, fallback: number): number {
  return value !== null && Number.isFinite(value) && value >= 0 ? Math.max(0, Math.round(value)) : fallback;
}

function pageRange(start: number, end: number): number[] {
  return Array.from({ length: end - start + 1 }, (_, index) => start + index);
}

function uniqueNumbers(values: number[]): number[] {
  return Array.from(new Set(values)).sort((a, b) => a - b);
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values.map(clean).filter(Boolean)));
}

function parseSpecifications(value: string): Array<{ label: string; value: string }> {
  return value
    .split(/\r?\n|\s+\|\s+/)
    .map((line) => {
      const separator = line.indexOf(":");
      if (separator < 1) return null;
      const label = line.slice(0, separator).trim();
      const specValue = line.slice(separator + 1).trim();
      return label && specValue ? { label: label.slice(0, 120), value: specValue.slice(0, 500) } : null;
    })
    .filter((entry): entry is { label: string; value: string } => Boolean(entry))
    .slice(0, 60);
}

function slugPart(value: string): string {
  return normalize(value).replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "pdf-katalog";
}

function withoutLastError(job: SmartImportJob): SmartImportJob {
  const { lastError: _lastError, ...rest } = job;
  return rest;
}

function withoutCurrentPage(progress: PdfImportProgress): PdfImportProgress {
  const { currentPage: _currentPage, ...rest } = progress;
  return rest;
}

async function ensureJobsFile(): Promise<void> {
  if (existsSync(jobsPath)) {
    return;
  }

  await mkdir(dataDir, { recursive: true });
  await writeJson(jobsPath, []);
}

async function readJson<T>(filePath: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await readFile(filePath, "utf8")) as T;
  } catch (error) {
    const code = typeof error === "object" && error !== null && "code" in error ? String(error.code) : "";
    if (code === "ENOENT") {
      return fallback;
    }

    throw error;
  }
}

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  const tmpPath = `${filePath}.${process.pid}.${randomUUID()}.tmp`;
  try {
    await writeFile(tmpPath, `${JSON.stringify(value, null, 2)}\n`);
    await rename(tmpPath, filePath);
  } finally {
    await unlink(tmpPath).catch(() => undefined);
  }
}

function cdata(value: string): string {
  return clean(value).replace(/\]\]>/g, "]]]]><![CDATA[>");
}

function escapeXml(value: string): string {
  return clean(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalize(value: string): string {
  return value
    .trim()
    .toLocaleLowerCase("tr-TR")
    .replace(/[ç]/g, "c")
    .replace(/[ğ]/g, "g")
    .replace(/[ı]/g, "i")
    .replace(/[ö]/g, "o")
    .replace(/[ş]/g, "s")
    .replace(/[ü]/g, "u");
}

function stripUndefined<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map(stripUndefined) as T;
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, entry]) => entry !== undefined)
        .map(([key, entry]) => [key, stripUndefined(entry)])
    ) as T;
  }

  return value;
}

function findWorkspaceRoot(startDir: string): string {
  let current = startDir;

  while (current !== path.dirname(current)) {
    if (isWorkspaceRoot(current)) {
      return current;
    }

    current = path.dirname(current);
  }

  return startDir;
}

function isWorkspaceRoot(dir: string): boolean {
  return existsSync(path.join(dir, "pnpm-workspace.yaml")) || existsSync(path.join(dir, "data", "catalog-store.json"));
}
