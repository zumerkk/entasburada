import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import type { ImportedSupplierProduct } from "@entas/catalog";
import { normalizeProductImage } from "../apps/web/lib/product-image-normalizer";

type ScrapedProduct = {
  siteId: string;
  url: string;
  name: string;
  brand: string;
  categories: string[];
  price: number;
  description: string;
  imageUrl: string;
  code: string;
  sourcePage?: number;
};

const rootDir = path.resolve(import.meta.dirname, "..");
const releaseVersion = "2026-08-11-mur-cell-v1";
const releaseDir = path.join(rootDir, "deploy", "catalog-releases", releaseVersion);
const uploadSubdir = path.join("catalog-imports", "mur-cell-2026", "products");
const uploadDir = path.join(releaseDir, "uploads", uploadSubdir);
const sitemapUrl = "https://www.mur-cellshop.com.tr/sitemap.xml";
const sourcePdfName = "MUR-CELLKATALOG DIJITAL.pdf";
const ocrDir = path.join(rootDir, "tmp", "pdfs", "mur-cell", "ocr-full", "text");
const shouldWrite = process.argv.includes("--write");
const verifiedCodeOverrides: Record<string, string> = {
  "245": "QB60",
  "246": "QB70",
  "247": "CPM158-1HP",
  "249": "IDB40-0.37KW",
  "251": "DHM5A",
  "255": "QDX1.5-25-0.55A",
  "256": "QDX1.5-32-0.75FA",
  "262": "V750DF",
  "265": "QSB-JH-40038",
  "266": "QSB-JH-5538",
  "267": "QSB-JH-7538",
  "272": "YHGZ50C",
  "274": "HP30",
  "278": "MUR-9029",
  "280": "9017",
  "281": "MUR-SET-4LU-281",
  "282": "MUR-9019-5LI",
  "283": "MUR-SET-6LI-283",
  "285": "MUR-BOYA-285",
  "286": "BX1004",
  "290": "MUR-9108",
  "291": "MUR-9112",
  "292": "DJ12-MAVI",
  "293": "DJ16-MAVI",
  "294": "MUR-9907",
  "295": "MUR-9908-3AH",
  "298": "MUR-LZR04",
  "299": "MUR-HT102",
  "300": "MUR-5931-SARI",
  "304": "CQ-205",
  "310": "FST-800",
  "319": "BAG1009/230",
  "321": "MJ-700C-13FT-MAVI",
  "323": "SF7J153-KIRMIZI",
  "330": "MUR-BH-11KG",
  "334": "Z1G-ZT-65",
  "336": "MUR-MP12V",
  "337": "MUR-MP24V",
  "338": "MMA250A",
  "339": "ST0203CNTA",
  "340": "ST0503",
  "341": "ST0603",
  "342": "YL-A3",
  "343": "YL-A15",
  "344": "MUR-KOMPRESOR-344",
  "345": "MUR-KOMPRESOR-345",
  "347": "MUR-AP01",
  "350": "3/8-0.91-28.5D-ZINCIR",
  "351": "WGN-BTZ-02",
  "352": "3/8-1.5-34D-ZINCIR",
  "353": "3/8-1.5-36D-ZINCIR",
  "354": "4-INCH-PALA",
  "355": "3/25-36D-PALA",
  "356": "MUR-MISINA-356",
  "359": "MUR-EP002",
  "360": "3/8-0.91-28.5D-PALA",
  "374": "SF7J153-MAVI",
  "375": "MUR-9019-6LI",
  "377": "MUR-APARAT-377",
  "378": "QB60-HIDROFOR",
  "380": "MUR-AP001",
  "383": "JET100P-HIDROFOR",
  "384": "DJ12-SARI",
  "385": "MJ-700C-13FT-SARI",
  "386": "SXL-2020W",
  "387": "MUR-9017-21V",
  "390": "FP9803B",
  "391": "ST0403",
  "393": "IDB40",
  "395": "MUR-5931-MAVI",
  "403": "MUR-SET-4LU-SARI",
  "404": "MUR-9908-3AH-50MM",
  "405": "MUR-SET-2LI-405"
};
const verifiedPdfPageOverrides: Record<string, number> = {
  "V1100DF": 82,
  "SXL-2020D": 110,
  "2020B": 110,
  "MUR-255": 89,
  "V370DF": 82,
  "V550DF": 82,
  "V750DF": 82,
  "V1500DF": 82,
  "QSB-JH-40038": 80,
  "QSB-JH-5538": 80,
  "QSB-JH-7538": 80,
  "HP30": 70,
  "MUR-9013": 9,
  "MUR-9022": 9,
  "MUR-9029": 18,
  "9017": 6,
  "BX3601": 27,
  "BX1004": 32,
  "MUR-9501": 14,
  "MUR-9502": 24,
  "MUR-9106": 16,
  "MUR-9108": 41,
  "MUR-9112": 48,
  "MUR-9907": 39,
  "KH-SCA11": 40,
  "MUR-HT102": 30,
  "CQ-205": 60,
  "HR-5800A": 53,
  "00-2500A": 54,
  "HR6000CL": 52,
  "HRC2510": 54,
  "FST-800": 66,
  "HX-16C": 66,
  "MD3215F": 84,
  "MD150-200ZT": 84,
  "MD3220F": 84,
  "DS-12502": 99,
  "MUR-90-2BS": 90,
  "MUR-MP12V": 107,
  "MUR-MP24V": 107,
  "MMA250A": 104,
  "ST0603": 112,
  "YL-A3": 111,
  "YL-A15": 111,
  "SCM-80": 76,
  "CQ205": 60,
  "SXL-2020W": 109,
  "ST0403": 112,
  "IDB40": 75,
  "CPM-158": 76,
  "MUR-9017": 6,
  "MUR-GS6201": 52,
  "BX3600": 27,
  "JET100P": 76,
  "DGP130": 132,
  "DKM60": 131,
  "DKM70": 131,
  "DCM158": 131,
  "QDX1.5-25-0.55A": 133
};

async function main(): Promise<void> {
  const sitemap = await fetchText(sitemapUrl);
  const urls = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)]
    .map((match) => decodeHtml(match[1] || "").trim())
    .filter((url) => url.startsWith("https://www.mur-cellshop.com.tr/"));
  const ocrPages = await loadOcrPages();
  const pages = await mapWithConcurrency(urls, 5, async (url) => {
    try {
      return parseProductPage(url, await fetchText(url), ocrPages);
    } catch (error) {
      console.warn(`Sayfa atlandı: ${url} (${error instanceof Error ? error.message : error})`);
      return null;
    }
  });
  const products = pages.filter((product): product is ScrapedProduct => Boolean(product));
  assertScrapedProducts(products);

  const report = {
    releaseVersion,
    sitemapUrls: urls.length,
    productCount: products.length,
    brands: countBy(products, (product) => product.brand),
    categories: countBy(products, (product) => product.categories.at(-1) || "Genel"),
    productsWithCode: products.filter((product) => product.code).length,
    productsMatchedToPdfPage: products.filter((product) => product.sourcePage).length,
    productsWithDescription: products.filter((product) => product.description.length >= 40).length,
    zeroPriceProducts: products.filter((product) => product.price <= 0).length,
    mode: shouldWrite ? "write" : "dry-run"
  };
  if (!shouldWrite) {
    console.log(JSON.stringify({ ...report, sample: products.slice(0, 8) }, null, 2));
    return;
  }

  await rm(releaseDir, { recursive: true, force: true });
  await mkdir(uploadDir, { recursive: true });
  const normalizedImages = await mapWithConcurrency(products, 4, async (product, index) => {
    const sourceImage = await fetchImage(product.imageUrl);
    const normalized = await normalizeProductImage(sourceImage);
    const imageKey = `${String(index + 1).padStart(4, "0")}-${slugify(product.code || product.siteId)}`;
    await writeFile(path.join(uploadDir, `${imageKey}.webp`), normalized.buffer);
    return {
      product,
      imageUrl: `/uploads/${uploadSubdir.split(path.sep).join("/")}/${imageKey}.webp`,
      sourceWidth: normalized.sourceWidth,
      sourceHeight: normalized.sourceHeight
    };
  });

  const importedProducts = normalizedImages.map(({ product, imageUrl }) => toImportedProduct(product, imageUrl));
  await writeFile(path.join(releaseDir, "products.json"), `${JSON.stringify(importedProducts, null, 2)}\n`);
  await writeFile(path.join(releaseDir, "manifest.json"), `${JSON.stringify({
    ...report,
    createdAt: new Date().toISOString(),
    source: {
      productData: "MUR-CELL resmi mağaza ürün sayfaları",
      catalogVerification: sourcePdfName,
      sitemap: sitemapUrl
    },
    imagePolicy: "Resmi mağaza orijinal görseli; 1200x1200 WebP, Lanczos3, beyaz zemin ve kontrollü hafif keskinleştirme",
    pricePolicy: "Resmi mağazada yayımlanan güncel TRY liste fiyatı; bayi oturumu dışında gizli",
    stockPolicy: "Ürün sayfası yayında; gerçek adet bilinmediği için stockQuantityKnown=false",
    sourceImageMinimum: normalizedImages.reduce((minimum, image) => Math.min(minimum, image.sourceWidth, image.sourceHeight), Number.POSITIVE_INFINITY),
    sourceImageMaximum: normalizedImages.reduce((maximum, image) => Math.max(maximum, image.sourceWidth, image.sourceHeight), 0)
  }, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
}

async function loadOcrPages(): Promise<Array<{ page: number; normalized: string }>> {
  const pages: Array<{ page: number; normalized: string }> = [];
  for (let page = 1; page <= 136; page += 1) {
    const filePath = path.join(ocrDir, `page-${String(page).padStart(3, "0")}.txt`);
    try {
      pages.push({ page, normalized: normalizeMatch(await readFile(filePath, "utf8")) });
    } catch {
      // Yerel OCR bulunmadığında mağaza kaydı yine alınır; PDF sayfa etiketi eklenmez.
    }
  }
  return pages;
}

function parseProductPage(
  url: string,
  html: string,
  ocrPages: Array<{ page: number; normalized: string }>
): ScrapedProduct | null {
  const siteId = html.match(/shopPHPUrunID\s*=\s*(\d+)\s*;/)?.[1] || "";
  if (!siteId) return null;
  const name = htmlText(html.match(/<div class="urunDetayBaslik"><h2>([\s\S]*?)<\/h2>/i)?.[1] || "");
  const imagePath = decodeHtml(html.match(/<a href="(images\/urunler\/[^"]+)" class="lightbox">/i)?.[1] || "");
  const rawPrice = html.match(/shopPHPUrunFiyatOrg\s*=\s*([0-9.]+)\s*;/)?.[1] || "0";
  if (!name || !imagePath) throw new Error("zorunlu ürün adı veya görseli yok");

  const breadcrumbBlock = html.match(/<div class="sayfaYoluGoster">([\s\S]*?)<\/div>/i)?.[1] || "";
  const breadcrumbs = [...breadcrumbBlock.matchAll(/<a[^>]*>([\s\S]*?)<\/a>/gi)]
    .map((match) => htmlText(match[1] || ""))
    .filter((value) => value && value !== "Anasayfa" && value !== "Ana Sayfa" && value !== name);
  const brand = htmlText(html.match(/<strong>Marka:<\/strong>[\s\S]*?<font>[\s\S]*?<a[^>]*>([\s\S]*?)<\/a>/i)?.[1] || "") || "MUR-CELL";
  const detailBlock = html.match(/<div id="tab01"[\s\S]*?<div class="tabtable">([\s\S]*?)<\/div>\s*<\/div>/i)?.[1] || "";
  const description = htmlText(detailBlock).replace(/\s*;\s*/g, " ").replace(/\s+-\s+/g, " ").trim();
  const price = Number(rawPrice);
  if (price <= 0) return null;
  const code = inferProductCode(siteId, name, new URL(url).pathname);
  const sourcePage = code ? matchPdfPage(code, ocrPages) : undefined;

  return {
    siteId,
    url,
    name,
    brand: canonicalBrand(brand),
    categories: breadcrumbs.length ? breadcrumbs : ["MUR-CELL Ürünleri"],
    price,
    description,
    imageUrl: new URL(imagePath, url).toString(),
    code,
    ...(sourcePage ? { sourcePage } : {})
  };
}

function toImportedProduct(product: ScrapedProduct, imageUrl: string): ImportedSupplierProduct {
  const sku = product.code || `MUR-WEB-${product.siteId}`;
  const category = product.categories.at(-1) || "MUR-CELL Ürünleri";
  const warrantyMonths = /(?:2 yıl|iki yıl) garanti/i.test(product.description) ? 24 : 0;
  return {
    sourceKey: "catalog-mur-cell-2026",
    sourceName: "MUR-CELL 2026 Ürün Kataloğu",
    externalId: product.siteId,
    sku,
    ...(product.code ? { manufacturerCode: product.code } : {}),
    productName: product.name,
    brandName: product.brand,
    categoryPath: product.categories,
    categoryName: category,
    unitType: "ADET",
    taxRate: "20",
    currency: "TRY",
    listPrice: product.price.toFixed(2),
    stockQuantity: 1,
    stockStatus: "in_stock",
    stockQuantityKnown: false,
    description: product.description || `${product.name}. MUR-CELL 2026 ürün kataloğu ve resmi mağaza kaydı üzerinden doğrulanmıştır.`,
    technicalSpecs: [
      { label: "Marka", value: product.brand },
      ...(product.code ? [{ label: "Model / Ürün Kodu", value: product.code }] : []),
      ...(product.sourcePage ? [{ label: "MUR-CELL 2026 Katalog Sayfası", value: String(product.sourcePage) }] : []),
      { label: "Fiyat Kaynağı", value: "MUR-CELL resmi mağaza güncel liste fiyatı" },
      { label: "Stok", value: "Ürün yayında; gerçek stok adedi için teyit gerekli" }
    ],
    minOrder: 1,
    packageQuantity: 1,
    cartonQuantity: 1,
    palletQuantity: 1,
    warrantyMonths,
    imageUrl,
    sourceUrl: product.url,
    priceVisibleToPublic: false
  };
}

async function fetchText(url: string): Promise<string> {
  const response = await fetchWithRetry(url, { headers: { "user-agent": "EntasBurada-CatalogImporter/1.0" } });
  return response.text();
}

async function fetchImage(url: string): Promise<Buffer> {
  const response = await fetchWithRetry(url, { headers: { accept: "image/*", "user-agent": "EntasBurada-CatalogImporter/1.0" } });
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.startsWith("image/")) throw new Error(`Görsel olmayan yanıt: ${url}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length < 2_000 || bytes.length > 20 * 1024 * 1024) throw new Error(`Geçersiz görsel boyutu: ${url}`);
  return bytes;
}

async function fetchWithRetry(url: string, init: RequestInit, attempts = 3): Promise<Response> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url, { ...init, signal: AbortSignal.timeout(30_000) });
      if (response.ok) return response;
      lastError = new Error(`${response.status} ${response.statusText}`);
      if (response.status < 500 && response.status !== 429) break;
    } catch (error) {
      lastError = error;
    }
    if (attempt < attempts) await new Promise((resolve) => setTimeout(resolve, attempt * 500));
  }
  throw lastError instanceof Error ? lastError : new Error(`İstek başarısız: ${url}`);
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

function assertScrapedProducts(products: ScrapedProduct[]): void {
  if (products.length < 100) throw new Error(`Beklenen kapsam sağlanamadı; yalnız ${products.length} ürün bulundu.`);
  const ids = new Set(products.map((product) => product.siteId));
  if (ids.size !== products.length) throw new Error("Tekrarlanan resmi mağaza ürün kimliği bulundu.");
  const urls = new Set(products.map((product) => product.url));
  if (urls.size !== products.length) throw new Error("Tekrarlanan ürün URL'si bulundu.");
  const missing = products.filter((product) => !product.name || !product.imageUrl || !product.categories.length);
  if (missing.length) throw new Error(`${missing.length} üründe zorunlu alan eksik.`);
}

function inferProductCode(siteId: string, name: string, pathname: string): string {
  if (siteId in verifiedCodeOverrides) return verifiedCodeOverrides[siteId]!;
  const normalizedName = name.toLocaleUpperCase("tr-TR").replace(/İ/g, "I").replace(/,(?=\d)/g, ".");
  const numericPrefix = normalizedName.match(/^\s*(\d{3,}[A-Z](?:[./-][A-Z0-9]+)*)\b/);
  if (numericPrefix?.[1]) return numericPrefix[1];
  const directCandidates = normalizedName.match(/\b[A-Z0-9]+(?:[./-][A-Z0-9]+)+\b|\b[A-Z]{1,8}\d[A-Z0-9.-]*\b/g) || [];
  const separatedCandidates = [...normalizedName.matchAll(/\b([A-Z]{1,8})[ -]+(\d[A-Z0-9]*(?:[./-][A-Z0-9]+)*(?:\s+(?:FA|FQG|YKT|YTH|ECO))?)\b/g)]
    .map((match) => `${match[1]}-${match[2]?.replace(/\s+/g, "-")}`);
  let candidates = [...directCandidates, ...separatedCandidates];
  if (!candidates.length) {
    const slug = pathname.replace(/\//g, " ").toLocaleUpperCase("tr-TR").replace(/İ/g, "I");
    candidates = slug.match(/\b[A-Z0-9]+(?:[./-][A-Z0-9]+)+\b|\b[A-Z]{1,8}\d[A-Z0-9.-]*\b/g) || [];
  }
  const rejected = /^(?:\d+(?:V|W|WATT|KW|HP|MM|CM|MT|LT|AH|AMPER)|[A-Z]?\d+(?:MM|CM|V|W|KW|HP|AH))$/;
  const scored = [...new Set(candidates.map((value) => value.replace(/[.,;:]+$/, "")))]
    .filter((value) => value.length >= 4 && value.length <= 40 && /\d/.test(value) && !rejected.test(value))
    .map((value) => ({
      value,
      score: (value.includes("-") ? 20 : 0) + (/^(MUR|BX|KH|KS|QSB|QDX|JET|CPM|SCM|SXL|DYB|V\d|MD|JL|HR|RP|ST|YL|DKM|DCM|DGP|GPA|GPS|CG|CQ|HP|TP)/.test(value) ? 100 : 0) + Math.min(value.length, 30)
    }))
    .sort((left, right) => right.score - left.score);
  return scored[0]?.value || "";
}

function matchPdfPage(code: string, pages: Array<{ page: number; normalized: string }>): number | undefined {
  const verifiedPage = verifiedPdfPageOverrides[code];
  if (verifiedPage) return verifiedPage;
  const wanted = normalizeMatch(code);
  const exact = pages.find((page) => page.normalized.includes(wanted));
  return exact?.page;
}

function canonicalBrand(value: string): string {
  const normalized = normalizeMatch(value);
  if (normalized.includes("DAYUAN")) return "DAYUAN";
  if (normalized.includes("IRONPFERD")) return "IRONPFERD";
  return "MUR-CELL";
}

function htmlText(value: string): string {
  return decodeHtml(value.replace(/<br\s*\/?>/gi, " ").replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

function decodeHtml(value: string): string {
  const named: Record<string, string> = { amp: "&", quot: '"', apos: "'", lt: "<", gt: ">", nbsp: " " };
  return value.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, entity: string) => {
    if (entity.startsWith("#x")) return String.fromCodePoint(Number.parseInt(entity.slice(2), 16));
    if (entity.startsWith("#")) return String.fromCodePoint(Number.parseInt(entity.slice(1), 10));
    return named[entity.toLowerCase()] ?? match;
  });
}

function normalizeMatch(value: string): string {
  return value.toLocaleUpperCase("tr-TR").replace(/İ/g, "I").replace(/[^A-Z0-9]+/g, "");
}

function slugify(value: string): string {
  return value.toLocaleLowerCase("tr-TR")
    .replace(/[ç]/g, "c").replace(/[ğ]/g, "g").replace(/[ı]/g, "i")
    .replace(/[ö]/g, "o").replace(/[ş]/g, "s").replace(/[ü]/g, "u")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "urun";
}

function countBy<T>(items: T[], key: (item: T) => string): Record<string, number> {
  return items.reduce<Record<string, number>>((counts, item) => {
    const value = key(item);
    counts[value] = (counts[value] || 0) + 1;
    return counts;
  }, {});
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
