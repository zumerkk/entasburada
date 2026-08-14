import { access, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import type { ImportedSupplierProduct } from "@entas/catalog";
import {
  createEntasCatalogProductImage,
  ENTAS_CATALOG_IMAGE_CANVAS_SIZE
} from "../apps/web/lib/product-image-normalizer";

type QualityEntry = {
  externalId: string;
  productName: string;
  visual: {
    key: string;
    page: number;
    candidateIndex: number;
    region: { x: number; y: number; width: number; height: number };
  };
};

type VisualGroup = {
  key: string;
  page: number;
  sourceEdgePx: number;
  products: QualityEntry[];
};

const rootDir = path.resolve(import.meta.dirname, "..");
const releaseVersion = "2026-08-15-kf-kuzey-fittings-quality-v5";
const sourceReleaseDir = path.join(rootDir, "deploy", "catalog-releases", "2026-08-14-kf-kuzey-fittings-quality-v2");
const v4ReleaseDir = path.join(rootDir, "deploy", "catalog-releases", "2026-08-14-kf-kuzey-fittings-quality-v4");
const releaseDir = path.join(rootDir, "deploy", "catalog-releases", releaseVersion);
const uploadSubdir = path.join("catalog-imports", "kf-kuzey-fittings-2026-quality-v5", "products");
const uploadDir = path.join(releaseDir, "uploads", uploadSubdir);
const qualityMapPath = path.join(rootDir, "scripts", "catalog-data", "kf-kuzey-quality-v2.json");
const restoredDir = path.join(rootDir, "scripts", "catalog-data", "kf-kuzey-clarity-v5", "restored");
const officialPdfUrl = "https://kuzeyfittings.com.tr/wp-content/uploads/2026/06/2026-Katalog.pdf";
const shouldWrite = process.argv.includes("--write");
const minimumAcceptableSourceEdgePx = 220;

async function main(): Promise<void> {
  const [sourceProducts, v4Products, qualityMap] = await Promise.all([
    readJson<ImportedSupplierProduct[]>(path.join(sourceReleaseDir, "products.json")),
    readJson<ImportedSupplierProduct[]>(path.join(v4ReleaseDir, "products.json")),
    readJson<QualityEntry[]>(qualityMapPath)
  ]);
  const sourceByExternalId = new Map(sourceProducts.map((product) => [product.externalId, product]));
  const v4ExternalIds = new Set(v4Products.map((product) => product.externalId));
  const lowResolutionEntries = qualityMap.filter((entry) => (
    estimatedSourceEdgePx(entry) < minimumAcceptableSourceEdgePx
    && !v4ExternalIds.has(entry.externalId)
  ));
  const visualGroups = groupVisuals(lowResolutionEntries);
  await assertCoverage(lowResolutionEntries, visualGroups, sourceByExternalId);

  const report = {
    releaseVersion,
    productCount: lowResolutionEntries.length,
    uniqueImageCount: visualGroups.length,
    minimumAcceptedOriginalEdgePx: minimumAcceptableSourceEdgePx,
    remainingLowResolutionCount: 0,
    normalizedCanvas: `${ENTAS_CATALOG_IMAGE_CANVAS_SIZE}x${ENTAS_CATALOG_IMAGE_CANVAS_SIZE} WebP`,
    mode: shouldWrite ? "write" : "dry-run"
  };
  if (!shouldWrite) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  await rm(releaseDir, { recursive: true, force: true });
  await mkdir(uploadDir, { recursive: true });
  const imageUrls = new Map<string, string>();
  const imageStats = await mapWithConcurrency(visualGroups, 2, async (group) => {
    const inputPath = path.join(restoredDir, `${group.key}.png`);
    const normalized = await createEntasCatalogProductImage(inputPath);
    const filename = `${group.key}.webp`;
    await writeFile(path.join(uploadDir, filename), normalized.buffer);
    imageUrls.set(group.key, `/uploads/${uploadSubdir.split(path.sep).join("/")}/${filename}`);
    return {
      key: group.key,
      page: group.page,
      productCount: group.products.length,
      previousEstimatedSourceEdgePx: group.sourceEdgePx,
      restoredSourceWidth: normalized.sourceWidth,
      restoredSourceHeight: normalized.sourceHeight,
      outputWidth: normalized.width,
      outputHeight: normalized.height
    };
  });

  const qualityByExternalId = new Map(lowResolutionEntries.map((entry) => [entry.externalId, entry]));
  const products = sourceProducts
    .filter((product) => qualityByExternalId.has(product.externalId))
    .map((product) => {
      const entry = required(qualityByExternalId.get(product.externalId), product.externalId);
      return buildProduct(product, entry, required(imageUrls.get(entry.visual.key), entry.visual.key));
    });
  if (products.length !== lowResolutionEntries.length) {
    throw new Error(`V5 ürün sayısı uyuşmuyor: ${products.length}/${lowResolutionEntries.length}`);
  }

  await writeFile(path.join(releaseDir, "products.json"), `${JSON.stringify(products, null, 2)}\n`);
  await writeFile(path.join(releaseDir, "manifest.json"), `${JSON.stringify({
    ...report,
    createdAt: new Date().toISOString(),
    source: {
      productData: "KF Kuzey Fittings 2026/1 resmî fiyat kataloğu",
      officialPdf: officialPdfUrl,
      qualityMap: path.relative(rootDir, qualityMapPath)
    },
    imagePolicy: "V2 taramasında tahmini kısa kenarı 220 pikselin altında kalan ve V4'te yenilenmemiş bütün KF görselleri ürün biçimi korunarak yüksek çözünürlüklü olarak restore edildi. Görseller oranı bozulmadan 2160px ENTAŞBURADA kartına alındı.",
    coveragePolicy: "Kalan düşük çözünürlüklü 32 görsel ailesinin tamamı ve bu görselleri kullanan 180 ürün varyantı yenilendi; eşik altında açık kayıt bırakılmadı.",
    images: imageStats
  }, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
}

function buildProduct(source: ImportedSupplierProduct, entry: QualityEntry, imageUrl: string): ImportedSupplierProduct {
  const specs = (source.technicalSpecs || []).filter((spec) => spec.label !== "Görsel Kalitesi");
  specs.push({
    label: "Görsel Kalitesi",
    value: "Tam netlik V5; ürün biçimi korunmuş yüksek çözünürlüklü restorasyon ve oran korumalı 2160px ENTAŞ sunum standardı"
  });
  const baseDescription = source.description.replace(/\s*Düşük çözünürlüklü katalog küçük resmi[^.]*\./giu, "").trim();
  return {
    ...source,
    sourceName: "KF Kuzey Fittings 2026/1 Fiyat Kataloğu - Tam Netlik V5",
    description: `${baseDescription} Katalogdaki düşük çözünürlüklü görsel kaldırılmış; ürün geometrisi korunarak netleştirilmiş yüksek çözünürlüklü görselle değiştirilmiştir.`.trim(),
    technicalSpecs: specs,
    imageUrl,
    sourceUrl: `${officialPdfUrl}#page=${entry.visual.page}`
  };
}

function estimatedSourceEdgePx(entry: QualityEntry): number {
  return Math.min(entry.visual.region.width, entry.visual.region.height) * 400 / 72;
}

function groupVisuals(entries: QualityEntry[]): VisualGroup[] {
  const groups = new Map<string, VisualGroup>();
  for (const entry of entries) {
    const existing = groups.get(entry.visual.key);
    if (existing) {
      existing.products.push(entry);
      continue;
    }
    groups.set(entry.visual.key, {
      key: entry.visual.key,
      page: entry.visual.page,
      sourceEdgePx: Math.round(estimatedSourceEdgePx(entry)),
      products: [entry]
    });
  }
  return [...groups.values()].sort((a, b) => a.page - b.page || a.key.localeCompare(b.key));
}

async function assertCoverage(
  entries: QualityEntry[],
  groups: VisualGroup[],
  sourceByExternalId: Map<string, ImportedSupplierProduct>
): Promise<void> {
  if (entries.length !== 180) throw new Error(`180 yerine ${entries.length} düşük çözünürlüklü ürün bulundu.`);
  if (groups.length !== 32) throw new Error(`32 yerine ${groups.length} düşük çözünürlüklü görsel ailesi bulundu.`);
  if (new Set(entries.map((entry) => entry.externalId)).size !== entries.length) {
    throw new Error("V5 kapsam listesinde tekrarlanan ürün var.");
  }
  for (const group of groups) {
    const sourcePath = path.join(restoredDir, `${group.key}.png`);
    try {
      await access(sourcePath);
    } catch {
      throw new Error(`V5 restore görseli eksik: ${sourcePath}`);
    }
    for (const entry of group.products) {
      if (!sourceByExternalId.has(entry.externalId)) throw new Error(`V2 ürününde kayıt yok: ${entry.externalId}`);
    }
  }
}

async function readJson<T>(filePath: string): Promise<T> {
  return JSON.parse(await readFile(filePath, "utf8")) as T;
}

function required<T>(value: T | undefined, name: string): T {
  if (value === undefined) throw new Error(`Zorunlu değer yok: ${name}`);
  return value;
}

async function mapWithConcurrency<T, R>(items: T[], concurrency: number, task: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await task(items[index]!);
    }
  }));
  return results;
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
