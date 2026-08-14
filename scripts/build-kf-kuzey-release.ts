import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import type { ImportedSupplierProduct } from "@entas/catalog";
import { cropAndNormalizeProductImage } from "../apps/web/lib/product-image-normalizer";

type SeedProduct = {
  page: number;
  manufacturerCode: string;
  price: number;
  currency: string;
  name: string;
  variant: string;
  raw: string;
  categoryPath: string[];
  externalId: string;
  sku: string;
  image: {
    pageFile: string;
    imageKey: string;
    crop: { left: number; top: number; width: number; height: number };
  };
};

const rootDir = path.resolve(import.meta.dirname, "..");
const releaseVersion = "2026-08-14-kf-kuzey-fittings-v1";
const releaseDir = path.join(rootDir, "deploy", "catalog-releases", releaseVersion);
const uploadSubdir = path.join("catalog-imports", "kf-kuzey-fittings-2026-1", "products");
const uploadDir = path.join(releaseDir, "uploads", uploadSubdir);
const seedPath = path.join(rootDir, "scripts", "catalog-data", "kf-kuzey-2026.json");
const pageRenderDir = path.join(rootDir, "tmp", "pdfs", "kf-kuzey", "render-300");
const officialPdfUrl = "https://kuzeyfittings.com.tr/wp-content/uploads/2026/06/2026-Katalog.pdf";
const shouldWrite = process.argv.includes("--write");

async function main(): Promise<void> {
  const seeds = JSON.parse(await readFile(seedPath, "utf8")) as SeedProduct[];
  assertSeeds(seeds);
  const uniqueImages = [...new Map(seeds.map((seed) => [seed.image.imageKey, seed.image])).values()]
    .sort((a, b) => a.imageKey.localeCompare(b.imageKey));
  const report = {
    releaseVersion,
    productCount: seeds.length,
    pricedProductCount: seeds.filter((seed) => seed.price > 0).length,
    contactPriceProductCount: seeds.filter((seed) => seed.price <= 0).length,
    uniqueManufacturerCodeCount: new Set(seeds.map((seed) => seed.manufacturerCode)).size,
    uniqueImageCount: uniqueImages.length,
    catalogPageCount: new Set(seeds.map((seed) => seed.page)).size,
    currencies: countBy(seeds, (seed) => seed.currency),
    categories: countBy(seeds, (seed) => seed.categoryPath.at(-1) || "Genel"),
    mode: shouldWrite ? "write" : "dry-run"
  };
  if (!shouldWrite) {
    console.log(JSON.stringify({ ...report, sample: seeds.slice(0, 6) }, null, 2));
    return;
  }

  await rm(releaseDir, { recursive: true, force: true });
  await mkdir(uploadDir, { recursive: true });
  const imageUrls = new Map<string, string>();
  const normalized = await mapWithConcurrency(uniqueImages, 5, async (image, index) => {
    const sourcePath = path.join(pageRenderDir, image.pageFile);
    const output = await cropAndNormalizeProductImage(sourcePath, image.crop);
    const filename = `${String(index + 1).padStart(4, "0")}-${slugify(image.imageKey)}.webp`;
    await writeFile(path.join(uploadDir, filename), output.buffer);
    const imageUrl = `/uploads/${uploadSubdir.split(path.sep).join("/")}/${filename}`;
    imageUrls.set(image.imageKey, imageUrl);
    return { sourceWidth: output.sourceWidth, sourceHeight: output.sourceHeight };
  });

  const products = seeds.map((seed) => toImportedProduct(seed, required(imageUrls.get(seed.image.imageKey), seed.image.imageKey)));
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
    imagePolicy: "Resmi PDF ürün görselleri kontrollü kırpıldı; 1200x1200 WebP, Lanczos3, beyaz zemin ve kontrollü hafif keskinleştirme uygulandı",
    pricePolicy: "2026/1 resmi katalog liste fiyatı; TRY ve sayfa 33 için USD; bayi oturumu dışında gizli; F.Sorunuz satırları 0.00",
    stockPolicy: "Katalogda ürün yer alıyor; gerçek stok adedi bilinmediği için stockQuantityKnown=false",
    normalizedCanvas: "1200x1200 WebP",
    minimumSourceCrop: normalized.reduce((minimum, image) => Math.min(minimum, image.sourceWidth, image.sourceHeight), Number.POSITIVE_INFINITY),
    maximumSourceCrop: normalized.reduce((maximum, image) => Math.max(maximum, image.sourceWidth, image.sourceHeight), 0)
  }, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
}

function toImportedProduct(seed: SeedProduct, imageUrl: string): ImportedSupplierProduct {
  const category = seed.categoryPath.at(-1) || "KF Kuzey Fittings Ürünleri";
  const priceSource = seed.price > 0
    ? `KF Kuzey Fittings 2026/1 resmi katalog liste fiyatı (${seed.currency})`
    : "Resmi katalogda F.Sorunuz / güvenilir okunabilir fiyat yok; temsilci teyidi gerekli";
  const description = [
    `${seed.name}.`,
    `Ürün kodu: ${seed.manufacturerCode}.`,
    seed.variant ? `Varyant: ${seed.variant}.` : "",
    `KF Kuzey Fittings 2026/1 resmi kataloğunun ${seed.page}. sayfasından aktarılmıştır.`,
    `Katalog kaydı: ${seed.raw}.`,
    "Gerçek stok ve teslim süresi sipariş öncesinde teyit edilmelidir."
  ].filter(Boolean).join(" ");
  return {
    sourceKey: "catalog-kf-kuzey-fittings-2026-1",
    sourceName: "KF Kuzey Fittings 2026/1 Fiyat Kataloğu",
    externalId: seed.externalId,
    sku: seed.sku,
    manufacturerCode: seed.manufacturerCode,
    productName: seed.name,
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
      { label: "Fiyat Kaynağı", value: priceSource },
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

function assertSeeds(seeds: SeedProduct[]): void {
  if (seeds.length < 2_300) throw new Error(`Beklenen ürün kapsamı sağlanamadı: ${seeds.length}`);
  const skus = new Set(seeds.map((seed) => seed.sku));
  const ids = new Set(seeds.map((seed) => seed.externalId));
  if (skus.size !== seeds.length) throw new Error("Tekrarlanan SKU bulundu");
  if (ids.size !== seeds.length) throw new Error("Tekrarlanan externalId bulundu");
  const invalid = seeds.filter((seed) =>
    !seed.name || !seed.manufacturerCode || !seed.categoryPath.length || !seed.image?.imageKey ||
    seed.page < 4 || seed.page > 128 || seed.price < 0 || !["TRY", "USD"].includes(seed.currency) ||
    seed.image.crop.width <= 0 || seed.image.crop.height <= 0
  );
  if (invalid.length) throw new Error(`${invalid.length} seed kaydında zorunlu alan geçersiz`);
  if (seeds.filter((seed) => seed.currency === "USD").length !== 7) throw new Error("USD ürün kapsamı 7 olmalı");
}

function required(value: string | undefined, key: string): string {
  if (!value) throw new Error(`Görsel URL'si üretilemedi: ${key}`);
  return value;
}

function slugify(value: string): string {
  return value.toLocaleLowerCase("tr-TR").replace(/ı/g, "i").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 90);
}

function countBy<T>(items: T[], key: (item: T) => string): Record<string, number> {
  return items.reduce<Record<string, number>>((result, item) => {
    const value = key(item);
    result[value] = (result[value] || 0) + 1;
    return result;
  }, {});
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
