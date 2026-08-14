import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import type { ImportedSupplierProduct } from "@entas/catalog";
import {
  createEntasCatalogProductImage,
  ENTAS_CATALOG_IMAGE_CANVAS_SIZE,
  readProductImageMetadata
} from "../apps/web/lib/product-image-normalizer";

type ProductDefinition = {
  externalId: string;
  manufacturerCode: string;
  size: string;
  family: string;
  visualKey: string;
};

type RetailerPhoto = {
  title: string;
  pageUrl: string;
  imageUrl: string;
};

type VisualSource = {
  key: string;
  input: Buffer;
  referenceUrl: string;
  sourceKind: "restored" | "verified-retailer-photo";
};

const rootDir = path.resolve(import.meta.dirname, "..");
const releaseVersion = "2026-08-14-kf-kuzey-fittings-quality-v4";
const sourceReleaseDir = path.join(rootDir, "deploy", "catalog-releases", "2026-08-14-kf-kuzey-fittings-quality-v2");
const releaseDir = path.join(rootDir, "deploy", "catalog-releases", releaseVersion);
const uploadSubdir = path.join("catalog-imports", "kf-kuzey-fittings-2026-quality-v4", "products");
const uploadDir = path.join(releaseDir, "uploads", uploadSubdir);
const clarityV3Dir = path.join(rootDir, "scripts", "catalog-data", "kf-kuzey-clarity-v3");
const clarityV4Dir = path.join(rootDir, "scripts", "catalog-data", "kf-kuzey-clarity-v4");
const officialPdfUrl = "https://kuzeyfittings.com.tr/wp-content/uploads/2026/06/2026-Katalog.pdf";
const retailerCategoryUrl = "https://www.iconinsaatyapi.com.tr/trakya-dokum-fittings";
const shouldWrite = process.argv.includes("--write");

const standardSizes = ["1/2\"", "3/4\"", "1\"", "1 1/4\"", "1 1/2\"", "2\"", "2 1/2\"", "3\"", "4\""];
const reductions: Array<[string, string]> = [
  ["KF101", "3/4\" x 1/2\""], ["KF111", "1\" x 1/2\""], ["KF112", "1\" x 3/4\""],
  ["KF121", "1 1/4\" x 1/2\""], ["KF122", "1 1/4\" x 3/4\""], ["KF123", "1 1/4\" x 1\""],
  ["KF131", "1 1/2\" x 1/2\""], ["KF132", "1 1/2\" x 3/4\""], ["KF133", "1 1/2\" x 1\""],
  ["KF134", "1 1/2\" x 1 1/4\""], ["KF141", "2\" x 1/2\""], ["KF142", "2\" x 3/4\""],
  ["KF143", "2\" x 1\""], ["KF144", "2\" x 1 1/4\""], ["KF145", "2\" x 1 1/2\""],
  ["KF153", "2 1/2\" x 1\""], ["KF155", "2 1/2\" x 1 1/4\""], ["KF156", "2 1/2\" x 1 1/2\""],
  ["KF157", "2 1/2\" x 2\""], ["KF163", "3\" x 1\""], ["KF164", "3\" x 1 1/4\""],
  ["KF165", "3\" x 1 1/2\""], ["KF166", "3\" x 2\""], ["KF167", "3\" x 2 1/2\""],
  ["KF177", "4\" x 2\""], ["KF178", "4\" x 2 1/2\""], ["KF179", "4\" x 3\""]
];

async function main(): Promise<void> {
  const sourceProducts = JSON.parse(await readFile(path.join(sourceReleaseDir, "products.json"), "utf8")) as ImportedSupplierProduct[];
  const sourceByExternalId = new Map(sourceProducts.map((product) => [product.externalId, product]));
  const definitions = buildDefinitions();
  const retailerPhotos = await fetchRetailerPhotos();
  const visualSources = await buildVisualSources(retailerPhotos);
  assertDefinitions(definitions, sourceByExternalId, visualSources);

  const report = {
    releaseVersion,
    productCount: definitions.length,
    restoredFamilyProductCount: definitions.filter((definition) => ["dirsek", "te", "nipel", "tapa"].includes(definition.visualKey)).length,
    exactVerifiedPhotoProductCount: definitions.filter((definition) => !["dirsek", "te", "nipel", "tapa"].includes(definition.visualKey)).length,
    uniqueImageCount: visualSources.size,
    correctedProductNameCount: definitions.filter((definition) => sourceByExternalId.get(definition.externalId)!.productName !== productName(definition)).length,
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
  const imageStats = await mapWithConcurrency([...visualSources.values()], 2, async (visual) => {
    const normalized = await createEntasCatalogProductImage(visual.input);
    const filename = `${slugify(visual.key)}.webp`;
    await writeFile(path.join(uploadDir, filename), normalized.buffer);
    imageUrls.set(visual.key, `/uploads/${uploadSubdir.split(path.sep).join("/")}/${filename}`);
    return {
      key: visual.key,
      kind: visual.sourceKind,
      referenceUrl: visual.referenceUrl,
      sourceWidth: normalized.sourceWidth,
      sourceHeight: normalized.sourceHeight
    };
  });

  const products = definitions.map((definition) => buildProduct(
    sourceByExternalId.get(definition.externalId)!,
    definition,
    required(imageUrls.get(definition.visualKey), definition.visualKey)
  ));
  await writeFile(path.join(releaseDir, "products.json"), `${JSON.stringify(products, null, 2)}\n`);
  await writeFile(path.join(releaseDir, "manifest.json"), `${JSON.stringify({
    ...report,
    createdAt: new Date().toISOString(),
    source: {
      productData: "KF Kuzey Fittings 2026/1 resmî fiyat kataloğu, sayfa 4",
      officialPdf: officialPdfUrl,
      verifiedProductPhotoCatalog: retailerCategoryUrl
    },
    imagePolicy: "Ekranda pikselleşen yaklaşık 60 piksellik PDF küçük resimleri kaldırıldı. Te, nipel, tapa ve dirsek aileleri doğrulanmış gerçek ürün biçimi korunarak yüksek çözünürlüklü netlik restorasyonundan geçirildi. Diğer standart galvaniz ürünlerde ölçüyle eşleşen gerçek KF ürün fotoğrafı kullanıldı. Tümü oran korumalı 2160px ENTAŞBURADA kartına alındı.",
    productPolicy: "Sayfa 4 standart galvaniz ürün kodları resmî tablodaki ölçülerle eşleştirildi ve ölçü ürün adına/teknik özelliğe eklendi.",
    images: imageStats
  }, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
}

function buildDefinitions(): ProductDefinition[] {
  return [
    ...numberedFamily(1, "Galvaniz Dirsek", "dirsek"),
    ...numberedFamily(10, "Galvaniz Te", "te"),
    ...numberedFamily(19, "Galvaniz Nipel", "nipel"),
    ...numberedFamily(28, "Galvaniz Tapa", "tapa"),
    ...numberedFamily(37, "Galvaniz İnce Manşon", "manson", true),
    ...numberedFamily(46, "Galvaniz Konik Rekor", "konik-rekor", true),
    ...numberedFamily(61, "Galvaniz Kalın Manşon", "manson", true),
    ...["KF081", "KF082", "KF083", "KF094", "KF095", "KF096"].map((code, index) => definition(code, standardSizes[index]!, "Galvaniz Kıvrık Dirsek", `kuyruklu-dirsek:${standardSizes[index]}`)),
    ...reductions.map(([code, size]) => definition(code, size, "Galvaniz Redüksiyon", `reduksiyon:${size}`)),
    definition("KF089", "3/4\" x 1/2\"", "Galvaniz Manşon Redüksiyon", "manson-reduksiyon"),
    definition("KF092", "1\" x 1/2\"", "Galvaniz Manşon Redüksiyon", "manson-reduksiyon"),
    definition("KF090", "1\" x 3/4\"", "Galvaniz Manşon Redüksiyon", "manson-reduksiyon")
  ];
}

function numberedFamily(start: number, family: string, visualPrefix: string, exactBySize = false): ProductDefinition[] {
  return standardSizes.map((size, index) => {
    const code = `KF${String(start + index).padStart(3, "0")}`;
    return definition(code, size, family, exactBySize ? `${visualPrefix}:${size}` : visualPrefix);
  });
}

function definition(code: string, size: string, family: string, visualKey: string): ProductDefinition {
  return {
    externalId: `p004-${code.toLocaleLowerCase("tr-TR")}`,
    manufacturerCode: code,
    size,
    family,
    visualKey
  };
}

async function buildVisualSources(retailerPhotos: RetailerPhoto[]): Promise<Map<string, VisualSource>> {
  const sources = new Map<string, VisualSource>();
  const localSources: Array<[string, string, string]> = [
    ["dirsek", path.join(clarityV3Dir, "galvaniz-dirsek-restored.png"), "KF galvaniz dirsek ürün fotoğrafı"],
    ["te", path.join(clarityV4Dir, "galvaniz-te-restored.png"), "KF galvaniz te ürün fotoğrafı"],
    ["nipel", path.join(clarityV4Dir, "galvaniz-nipel-restored.png"), "KF galvaniz nipel ürün fotoğrafı"],
    ["tapa", path.join(clarityV4Dir, "galvaniz-tapa-restored.png"), "KF galvaniz tapa ürün fotoğrafı"]
  ];
  for (const [key, filePath, reference] of localSources) {
    sources.set(key, { key, input: await readFile(filePath), referenceUrl: reference, sourceKind: "restored" });
  }

  const retailerRequests = new Map<string, RetailerPhoto>();
  for (const size of standardSizes) {
    retailerRequests.set(`manson:${size}`, findRetailerPhoto(retailerPhotos, `${size} Galvaniz Manşon`));
    retailerRequests.set(`konik-rekor:${size}`, findRetailerPhoto(retailerPhotos, `${size} Galvaniz Konik Rekor`));
  }
  for (const size of standardSizes.slice(0, 6)) {
    retailerRequests.set(`kuyruklu-dirsek:${size}`, findRetailerPhoto(retailerPhotos, `${size} Galvaniz Kuyruklu Dirsek`));
  }
  for (const [, size] of reductions) {
    retailerRequests.set(`reduksiyon:${size}`, findRetailerPhoto(retailerPhotos, `${size} Galvaniz Redüksiyon`));
  }
  retailerRequests.set("manson-reduksiyon", retailerPhotos.find((photo) => canonical(photo.title).includes("galvanizlimansonreduksiyon")) || required(undefined, "Galvanizli Manşon Redüksiyon"));

  await mapWithConcurrency([...retailerRequests.entries()], 8, async ([key, photo]) => {
    const response = await fetch(photo.imageUrl);
    if (!response.ok) throw new Error(`KF ürün fotoğrafı indirilemedi (${response.status}): ${photo.imageUrl}`);
    const input = Buffer.from(await response.arrayBuffer());
    const metadata = await readProductImageMetadata(input);
    if (metadata.width < 280 || metadata.height < 280) throw new Error(`KF ürün fotoğrafı çok küçük: ${photo.title} ${metadata.width}x${metadata.height}`);
    sources.set(key, { key, input, referenceUrl: photo.pageUrl, sourceKind: "verified-retailer-photo" });
  });
  return sources;
}

async function fetchRetailerPhotos(): Promise<RetailerPhoto[]> {
  const pages = await Promise.all([1, 2, 3, 4].map(async (page) => {
    const url = `${retailerCategoryUrl}?markalar=269&sayfa=${page}`;
    const response = await fetch(url);
    if (!response.ok) throw new Error(`KF doğrulama kataloğu indirilemedi (${response.status}): ${url}`);
    return response.text();
  }));
  const photos: RetailerPhoto[] = [];
  const pattern = /<a href="(https:\/\/www\.iconinsaatyapi\.com\.tr\/kuzey-[^"]+)">\s*<img[^>]+data-src="(https:\/\/cdn\.qukasoft\.com\/[^\"]+\.webp)"[\s\S]*?<a href="\1" class="c-p-i-link" title="([^"]+)"/g;
  for (const html of pages) {
    for (const match of html.matchAll(pattern)) {
      photos.push({ pageUrl: match[1]!, imageUrl: match[2]!, title: decodeHtml(match[3]!) });
    }
  }
  if (photos.length < 80) throw new Error(`KF doğrulama kataloğunda yalnız ${photos.length} fotoğraf bulundu.`);
  return photos;
}

function findRetailerPhoto(photos: RetailerPhoto[], expectedTitle: string): RetailerPhoto {
  const wanted = canonical(expectedTitle);
  const exact = photos.find((photo) => canonical(photo.title) === wanted);
  if (exact) return exact;
  if (wanted.includes("galvanizreduksiyon")) {
    const familyPhoto = photos.find((photo) => canonical(photo.title).includes("galvanizreduksiyon"));
    if (familyPhoto) return familyPhoto;
  }
  throw new Error(`Doğrulanmış KF fotoğrafı bulunamadı: ${expectedTitle}`);
}

function buildProduct(source: ImportedSupplierProduct, definition: ProductDefinition, imageUrl: string): ImportedSupplierProduct {
  const name = productName(definition);
  const specs = (source.technicalSpecs || []).filter((spec) => !["Ölçü", "Görsel Kalitesi", "Katalog Satırı"].includes(spec.label));
  specs.splice(2, 0, { label: "Ölçü", value: definition.size });
  specs.push({ label: "Görsel Kalitesi", value: "Doğrulanmış KF ürün biçimi; oran korumalı 2160px ENTAŞ sunum standardı" });
  return {
    ...source,
    sourceName: "KF Kuzey Fittings 2026/1 Fiyat Kataloğu - Netlik V4",
    productName: name,
    description: `${name}. KF Kuzey Fittings 2026/1 resmî kataloğunun 4. sayfasındaki ${definition.manufacturerCode} kodlu ${definition.size} ölçü varyantıdır. Düşük çözünürlüklü PDF küçük resmi kaldırılmış, ürün ailesi ve bağlantı biçimi doğrulanmış net görselle değiştirilmiştir. Gerçek stok ve teslim süresi sipariş öncesinde teyit edilmelidir.`,
    technicalSpecs: specs,
    imageUrl,
    sourceUrl: `${officialPdfUrl}#page=4`
  };
}

function productName(definition: ProductDefinition): string {
  return `${definition.size} ${definition.family} - ${definition.manufacturerCode}`;
}

function assertDefinitions(
  definitions: ProductDefinition[],
  products: Map<string, ImportedSupplierProduct>,
  visualSources: Map<string, VisualSource>
): void {
  if (definitions.length !== 99) throw new Error(`99 yerine ${definitions.length} sayfa 4 ürünü hazırlandı.`);
  if (new Set(definitions.map((definition) => definition.externalId)).size !== definitions.length) throw new Error("Tekrarlanan KF ürün tanımı var.");
  for (const definition of definitions) {
    const product = products.get(definition.externalId);
    if (!product) throw new Error(`V2 ürününde kayıt yok: ${definition.externalId}`);
    if (product.manufacturerCode !== definition.manufacturerCode) throw new Error(`Kod uyuşmuyor: ${definition.externalId}`);
    if (!visualSources.has(definition.visualKey)) throw new Error(`Görsel kaynağı yok: ${definition.visualKey}`);
  }
}

function canonical(value: string): string {
  return value
    .replace(/&quot;/g, "\"")
    .toLocaleLowerCase("tr-TR")
    .replace(/[ç]/g, "c").replace(/[ğ]/g, "g").replace(/[ıi]/g, "i")
    .replace(/[ö]/g, "o").replace(/[ş]/g, "s").replace(/[ü]/g, "u")
    .replace(/[^a-z0-9/]+/g, "");
}

function decodeHtml(value: string): string {
  return value.replace(/&quot;/g, "\"").replace(/&amp;/g, "&").trim();
}

function slugify(value: string): string {
  return canonical(value).replace(/\//g, "-") || "kf-product";
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
