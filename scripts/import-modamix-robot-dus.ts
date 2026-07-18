import { execFile as execFileCallback } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtemp, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import {
  mergeImportedProducts,
  publishProducts,
  slugify,
  type CatalogStore,
  type ImportedSupplierProduct
} from "@entas/catalog";
import {
  normalizeProductImage,
  readProductImageMetadata
} from "../apps/web/lib/product-image-normalizer";

const execFile = promisify(execFileCallback);
const args = new Map(
  process.argv.slice(2).map((argument) => {
    const [key, ...value] = argument.replace(/^--/, "").split("=");
    return [key, value.join("=") || "true"];
  })
);
const rootDir = path.resolve(import.meta.dirname, "..");
const pdfPath = path.resolve(requiredOption("pdf"));
const storePath = path.resolve(args.get("store") || path.join(rootDir, "data/catalog-store.json"));
const writeChanges = args.get("write") === "true";
const publish = args.get("publish") === "true";
const sourceKey = "catalog-modamix-2026-04-02";
const sourceName = "Modamix 2026 Robot Duş Kataloğu";
const publicImageDir = path.join(rootDir, "apps/web/public/uploads/catalog-imports/modamix-2026-04-02/products");
const publicImagePrefix = "/uploads/catalog-imports/modamix-2026-04-02/products";

interface ParsedProduct {
  page: number;
  position: number;
  sourceTitle: string;
  productName: string;
  manufacturerCode: string;
  externalId: string;
  sku: string;
  price: string;
  section: string;
  bullets: string[];
  imageUrl?: string;
}

interface PageHeader {
  title: string;
  code: string;
  lineIndex: number;
}

interface ExtractedPageImage {
  xref: number;
  duplicate: boolean;
  region: { x: number; y: number; width: number; height: number };
  originalWidth: number;
  originalHeight: number;
  sizeBytes?: number;
  filePath?: string;
}

const singleProductPages = [
  ...integerRange(3, 5),
  ...integerRange(7, 17),
  ...integerRange(19, 39),
  ...integerRange(42, 63)
];
const twoVariantPages = [40, 41];
const twoProductPages = integerRange(66, 77);
const gridProductPages = [78, 79];
const productPages = [...singleProductPages, ...twoVariantPages, ...twoProductPages, ...gridProductPages, 80].sort((a, b) => a - b);

async function main(): Promise<void> {
  const pageTexts = await extractPdfPages(pdfPath);
  if (pageTexts.length < 80) throw new Error(`PDF 80 sayfa yerine ${pageTexts.length} sayfa olarak okundu.`);

  const products = parseCatalog(pageTexts);
  applyUniqueIdentifiers(products);
  auditParsedProducts(products);

  let generatedImageCount = 0;
  if (writeChanges) {
    await rm(publicImageDir, { recursive: true, force: true });
    await mkdir(publicImageDir, { recursive: true });
    generatedImageCount = await createProductImages(products);
  }

  const importedProducts = products.map(toImportedProduct);
  const store = JSON.parse(await readFile(storePath, "utf8")) as CatalogStore;
  const incomingExternalIds = new Set(importedProducts.map((product) => product.externalId));
  const sourceSnapshotStore: CatalogStore = {
    ...store,
    products: store.products.filter((product) => product.sourceKey !== sourceKey || incomingExternalIds.has(product.externalId))
  };
  let nextStore = mergeImportedProducts(sourceSnapshotStore, importedProducts);
  let publishedCount = 0;

  if (publish) {
    const productIds = nextStore.products.filter((product) => product.sourceKey === sourceKey).map((product) => product.id);
    const result = publishProducts(nextStore, productIds, "modamix-pdf-import");
    nextStore = result.store;
    publishedCount = productIds.filter((id) => nextStore.products.some((product) => product.id === id && product.status === "ACTIVE" && product.isVisible)).length;
  }

  const importedRecords = nextStore.products.filter((product) => product.sourceKey === sourceKey);
  const wrongCategory = importedRecords.filter((product) => product.catalogClassification?.categorySlug !== "robot-dus");
  if (wrongCategory.length) throw new Error(`${wrongCategory.length} Modamix ürünü Robot Duşlar kategorisine atanamadı.`);
  if (publish && publishedCount !== products.length) throw new Error(`Yalnız ${publishedCount}/${products.length} ürün yayına alınabildi.`);

  if (writeChanges) await writeJsonAtomic(storePath, nextStore);
  console.log(JSON.stringify({
    ok: true,
    mode: writeChanges ? "write" : "dry-run",
    sourceKey,
    pdfPages: pageTexts.length,
    productPages: productPages.length,
    products: products.length,
    uniqueSkus: new Set(products.map((product) => product.sku)).size,
    pricedProducts: products.filter((product) => Number(product.price) > 0).length,
    productsWithImages: products.filter((product) => product.imageUrl).length,
    generatedImages: generatedImageCount,
    published: publishedCount,
    robotDusProducts: importedRecords.filter((product) => product.catalogClassification?.categorySlug === "robot-dus").length,
    storeProductsBefore: store.products.length,
    storeProductsAfter: nextStore.products.length
  }, null, 2));
}

async function extractPdfPages(filePath: string): Promise<string[]> {
  const binary = process.env.PDFTOTEXT_BIN || "pdftotext";
  const { stdout } = await execFile(binary, ["-layout", "-enc", "UTF-8", filePath, "-"], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    timeout: 120_000
  });
  const pages = stdout.replace(/\u0000/g, "").split("\f");
  if (!pages.at(-1)?.trim()) pages.pop();
  return pages;
}

function parseCatalog(pageTexts: string[]): ParsedProduct[] {
  const products: ParsedProduct[] = [];

  for (const page of singleProductPages) {
    const text = requiredPageText(pageTexts, page);
    const headers = extractHeaders(text);
    const prices = extractPrices(text);
    if (headers.length !== 1 || prices.length !== 1) {
      throw new Error(`Sayfa ${page}: 1 başlık/1 fiyat beklenirken ${headers.length}/${prices.length} bulundu.`);
    }
    products.push(createParsedProduct(page, 0, headers[0]!, prices[0]!, sectionForPage(page), extractTurkishBullets(text.split(/\r?\n/))));
  }

  for (const page of twoVariantPages) {
    const text = requiredPageText(pageTexts, page);
    const prices = extractPrices(text);
    if (prices.length !== 2) throw new Error(`Sayfa ${page}: 2 fiyat beklenirken ${prices.length} bulundu.`);
    const sharedBullets = extractTurkishBullets(text.split(/\r?\n/));
    const variants = page === 40
      ? [{ title: 'BOSNA 10"', code: "BSFT01" }, { title: 'BOSNA 12"', code: "BSFT02" }]
      : [{ title: 'ÜSKÜP 10"', code: "USFT01" }, { title: 'ÜSKÜP 12"', code: "USFT02" }];
    variants.forEach((variant, position) => products.push(createParsedProduct(
      page,
      position,
      { ...variant, lineIndex: 0 },
      prices[position]!,
      sectionForPage(page),
      sharedBullets
    )));
  }

  for (const page of twoProductPages) {
    const text = requiredPageText(pageTexts, page);
    const lines = text.split(/\r?\n/);
    const headers = extractHeaders(text);
    const prices = extractPrices(text);
    if (headers.length !== 2 || prices.length !== 2) {
      throw new Error(`Sayfa ${page}: 2 başlık/2 fiyat beklenirken ${headers.length}/${prices.length} bulundu.`);
    }
    headers.forEach((header, position) => {
      const nextLine = headers[position + 1]?.lineIndex ?? lines.length;
      const bullets = extractTurkishBullets(lines.slice(header.lineIndex, nextLine));
      products.push(createParsedProduct(page, position, header, prices[position]!, sectionForPage(page), bullets));
    });
  }

  for (const page of gridProductPages) {
    const text = requiredPageText(pageTexts, page);
    const headers = extractHeaders(text);
    const prices = extractPrices(text);
    if (headers.length !== 12 || prices.length !== 12) {
      throw new Error(`Sayfa ${page}: 12 başlık/12 fiyat beklenirken ${headers.length}/${prices.length} bulundu.`);
    }
    headers.forEach((header, position) => products.push(createParsedProduct(page, position, header, prices[position]!, sectionForPage(page), [])));
  }

  products.push(...page80Products());
  return products.sort((a, b) => a.page - b.page || a.position - b.position);
}

function createParsedProduct(
  page: number,
  position: number,
  header: PageHeader,
  price: string,
  section: string,
  bullets: string[]
): ParsedProduct {
  const manufacturerCode = normalizeModelCode(header.code);
  const sourceTitle = normalizeWhitespace(header.title).toLocaleUpperCase("tr-TR");
  return {
    page,
    position,
    sourceTitle,
    productName: buildProductName(sourceTitle, manufacturerCode, section),
    manufacturerCode,
    externalId: manufacturerCode,
    sku: manufacturerCode,
    price,
    section,
    bullets
  };
}

function page80Products(): ParsedProduct[] {
  const rows = [
    { code: "S009", title: "PASLANMAZ DUŞ SPİRALİ 150 CM", price: "130", bullets: ['1/2" - 1/2", 150 cm', "Paslanmaz", "Çift kenetli", "PVC iç hortum", "Zamak uç"] },
    { code: "S010", title: "ÇİFT KENETLİ DUŞ SPİRALİ 150-180 CM", price: "130", bullets: ['1/2" - 1/2", 150-180 cm', "Çift kenetli", "EPDM iç hortum", "Yanmaz", "Pirinç insert", "Zamak uç"] },
    { code: "S011-B", title: "360° KROM DUŞ SPİRALİ 150-180 CM", price: "260", bullets: ['1/2" - 1/2", 150-180 cm', "Kromlu", "Çift kenetli", "EPDM iç hortum", "Yanmaz", "Pirinç insert, o-ringli somun"] },
    { code: "S011-A", title: "KROM DUŞ SPİRALİ 150-180 CM", price: "230", bullets: ['1/2" - 1/2", 150-180 cm', "Kromlu", "Çift kenetli", "EPDM iç hortum", "Yanmaz", "Pirinç insert, pirinç somun"] },
    { code: "S013", title: "304 ÇELİK ÖRGÜ 360° DUŞ SPİRALİ 150-180 CM", price: "320", bullets: ['1/2" - 1/2", 150-180 cm', "Kromlu pirinç somun", "Çift kenetli", "EPDM iç hortum", "Yanmaz", "Pirinç insert, o-ringli somun"] },
    { code: "70CM-KROM", title: "70 CM KROM DUŞ SPİRALİ", price: "140", bullets: ['1/2" - 1/2", 70 cm', "Kromlu", "Çift kenetli", "EPDM iç hortum", "Yanmaz", "Pirinç insert, pirinç somun"] },
    { code: "70CM-POLISH", title: "70 CM POLISH DUŞ SPİRALİ", price: "80", bullets: ['1/2" - 1/2", 70 cm', "Polish", "Çift kenetli", "EPDM iç hortum", "Yanmaz", "Zamak somun"] }
  ];
  return rows.map((row, position) => createParsedProduct(
    80,
    position,
    { title: row.title, code: row.code, lineIndex: 0 },
    row.price,
    "Duş Spiralleri",
    row.bullets
  ));
}

function extractHeaders(text: string): PageHeader[] {
  const headers: PageHeader[] = [];
  for (const [lineIndex, line] of text.split(/\r?\n/).entries()) {
    for (const column of line.trim().split(/\s{2,}/)) {
      const match = column.match(/^(.+?)\s+MD\s*-\s*(.+)$/iu);
      if (!match?.[1] || !match[2] || !/\d/.test(match[2])) continue;
      headers.push({ title: match[1].trim(), code: match[2].trim(), lineIndex });
    }
  }
  return headers;
}

function extractPrices(text: string): string[] {
  return Array.from(text.matchAll(/\b(\d{1,3}(?:\.\d{3})*|\d+)\s*¨/g), (match) => match[1]!.replace(/\./g, ""));
}

function extractTurkishBullets(lines: string[]): string[] {
  const bullets: string[] = [];
  let current = "";
  const flush = () => {
    if (current) bullets.push(normalizeWhitespace(current));
    current = "";
  };

  for (const line of lines) {
    const value = line.trim();
    if (!value) {
      flush();
      continue;
    }
    if (value.startsWith("•")) {
      flush();
      const bullet = value.replace(/^•\s*/, "");
      if (isEnglishBullet(bullet)) break;
      current = bullet;
      continue;
    }
    if (current && !isCatalogDecoration(value)) current = `${current} ${value}`;
  }
  flush();
  return bullets;
}

function isEnglishBullet(value: string): boolean {
  return /\b(?:square slim overhead|wall-mounted|function hand shower|brass shower mixer|brass diverter|mixer body|stainless steel (?:black |chrome )?pipe|chromed stainless|water outlet spout|faucet|premium-quality|grade black|grade gold|grade white|grade chrome|easy use with sliding|hot \/ cold water)\b/i.test(value);
}

function isCatalogDecoration(value: string): boolean {
  return /^(?:ABS GÖVDE|SU TASARRUFU|KARE BAŞLIK|YUV\. BAŞLIK|KARE EL DUŞU|YUV\. EL DUŞU|www\.|\d+\s*¨|\d{1,2})/i.test(value);
}

function sectionForPage(page: number): string {
  if (page <= 5) return "Ankastre Banyo Sistemleri";
  if (page <= 13) return "Piyano Duş Sistemleri";
  if (page <= 17) return "Panel Duş Sistemleri";
  if (page <= 63) return "Tepe Duş Sistemleri";
  if (page <= 77) return "Sürgülü Duş Sistemleri";
  if (page <= 79) return "Mafsallı Duş Sistemleri";
  return "Duş Spiralleri";
}

function buildProductName(sourceTitle: string, modelCode: string, section: string): string {
  if (modelCode === "MD-ABG03") return "ANKASTRE BANYO GOLD DUŞ SİSTEMİ";
  if (modelCode === "MD-ABK01") return "ANKASTRE BANYO KROM DUŞ SİSTEMİ";
  if (modelCode === "MD-ABS02") return "ANKASTRE BANYO SİYAH DUŞ SİSTEMİ";
  if (section === "Duş Spiralleri") return sourceTitle;
  if (section === "Mafsallı Duş Sistemleri") return `${sourceTitle} MAFSALLI DUŞ SİSTEMİ`;
  if (section === "Sürgülü Duş Sistemleri") return `${sourceTitle} SÜRGÜLÜ DUŞ SİSTEMİ`;
  return `${sourceTitle} ROBOT DUŞ SİSTEMİ`;
}

function normalizeModelCode(value: string): string {
  const normalized = value
    .toLocaleUpperCase("tr-TR")
    .replace(/\s+/g, "")
    .replace(/[İIı]/g, "I")
    .replace(/Ç/g, "C")
    .replace(/Ğ/g, "G")
    .replace(/Ö/g, "O")
    .replace(/Ş/g, "S")
    .replace(/Ü/g, "U")
    .replace(/[^A-Z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return `MD-${normalized}`;
}

function applyUniqueIdentifiers(products: ParsedProduct[]): void {
  const byCode = new Map<string, ParsedProduct[]>();
  for (const product of products) {
    const values = byCode.get(product.manufacturerCode) ?? [];
    values.push(product);
    byCode.set(product.manufacturerCode, values);
  }
  for (const duplicates of byCode.values()) {
    if (duplicates.length === 1) continue;
    for (const product of duplicates) {
      const suffix = slugify(product.sourceTitle).toLocaleUpperCase("en-US");
      product.externalId = `${product.manufacturerCode}-P${product.page}`;
      product.sku = `${product.manufacturerCode}-${suffix}`;
    }
  }
}

function auditParsedProducts(products: ParsedProduct[]): void {
  if (products.length !== 116) throw new Error(`116 ürün beklenirken ${products.length} ürün ayrıştırıldı.`);
  const skus = new Set(products.map((product) => product.sku));
  const externalIds = new Set(products.map((product) => product.externalId));
  if (skus.size !== products.length) throw new Error("Modamix SKU listesinde tekrar var.");
  if (externalIds.size !== products.length) throw new Error("Modamix externalId listesinde tekrar var.");
  const missingPrice = products.filter((product) => !Number.isFinite(Number(product.price)) || Number(product.price) <= 0);
  if (missingPrice.length) throw new Error(`${missingPrice.length} üründe geçerli fiyat yok.`);
  const representedPages = new Set(products.map((product) => product.page));
  const missingPages = productPages.filter((page) => !representedPages.has(page));
  if (missingPages.length) throw new Error(`Ürün beklenen sayfalar eksik: ${missingPages.join(", ")}`);
}

async function createProductImages(products: ParsedProduct[]): Promise<number> {
  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "entas-modamix-"));
  const createdBySourceImage = new Map<string, string>();
  try {
    for (const page of productPages) {
      const pageProducts = products.filter((product) => product.page === page);
      const images = await extractPageImages(page, temporaryRoot);
      const selectedImages = selectImagesForProducts(page, pageProducts, images);
      if (selectedImages.length !== pageProducts.length) {
        throw new Error(`Sayfa ${page}: ${pageProducts.length} ürün için ${selectedImages.length} görsel eşleşti.`);
      }

      for (const [index, product] of pageProducts.entries()) {
        const image = selectedImages[index]!;
        if (!image.filePath) throw new Error(`Sayfa ${page}: ${product.sku} görsel dosyası bulunamadı.`);
        const sourceImageKey = `${page}:${image.xref}`;
        let imageUrl = createdBySourceImage.get(sourceImageKey);
        if (!imageUrl) {
          const fileName = `p${String(page).padStart(3, "0")}-${image.xref}-${slugify(product.sku)}.webp`;
          const outputPath = path.join(publicImageDir, fileName);
          const normalized = await normalizeProductImage(image.filePath);
          await writeFile(outputPath, normalized.buffer);
          const metadata = await readProductImageMetadata(outputPath);
          if (metadata.width !== 1200 || metadata.height !== 1200 || metadata.format !== "webp") {
            throw new Error(`${product.sku} görseli 1200x1200 WebP standardına getirilemedi.`);
          }
          imageUrl = `${publicImagePrefix}/${fileName}`;
          createdBySourceImage.set(sourceImageKey, imageUrl);
        }
        product.imageUrl = imageUrl;
      }
    }
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }

  const missingImages = products.filter((product) => !product.imageUrl);
  if (missingImages.length) throw new Error(`${missingImages.length} Modamix ürününde görsel yok.`);
  return createdBySourceImage.size;
}

async function extractPageImages(page: number, temporaryRoot: string): Promise<ExtractedPageImage[]> {
  const outputDir = path.join(temporaryRoot, `page-${String(page).padStart(3, "0")}`);
  const python = process.env.CATALOG_PYTHON_BIN || "python3";
  const script = path.join(rootDir, "scripts/pdf_extract_images.py");
  const { stdout } = await execFile(python, [script, pdfPath, String(page), outputDir], {
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
    timeout: 120_000
  });
  const rows = JSON.parse(stdout) as ExtractedPageImage[];
  return rows.filter((row) => !row.duplicate && row.filePath);
}

function selectImagesForProducts(page: number, products: ParsedProduct[], images: ExtractedPageImage[]): ExtractedPageImage[] {
  if (!images.length) throw new Error(`Sayfa ${page}: gömülü ürün görseli bulunamadı.`);
  if (page === 80) {
    const hoseImage = [...images].sort((a, b) => (b.sizeBytes ?? 0) - (a.sizeBytes ?? 0))[0]!;
    return products.map(() => hoseImage);
  }
  if (products.length === 1 || page === 40 || page === 41) {
    const largest = [...images].sort((a, b) => regionArea(b) - regionArea(a))[0]!;
    return products.map(() => largest);
  }

  const ordered = sortImagesByVisualGrid(images);
  if (ordered.length < products.length) {
    throw new Error(`Sayfa ${page}: ${products.length} ürün için yalnız ${ordered.length} özgün görsel bulundu.`);
  }
  return ordered.slice(0, products.length);
}

function sortImagesByVisualGrid(images: ExtractedPageImage[]): ExtractedPageImage[] {
  const rows: Array<{ y: number; images: ExtractedPageImage[] }> = [];
  for (const image of [...images].sort((a, b) => a.region.y - b.region.y || a.region.x - b.region.x)) {
    const row = rows.find((candidate) => Math.abs(candidate.y - image.region.y) <= 35);
    if (row) {
      row.images.push(image);
      row.y = row.images.reduce((sum, item) => sum + item.region.y, 0) / row.images.length;
    } else {
      rows.push({ y: image.region.y, images: [image] });
    }
  }
  return rows
    .sort((a, b) => a.y - b.y)
    .flatMap((row) => row.images.sort((a, b) => a.region.x - b.region.x));
}

function regionArea(image: ExtractedPageImage): number {
  return image.region.width * image.region.height;
}

function toImportedProduct(product: ParsedProduct): ImportedSupplierProduct {
  const specs = createTechnicalSpecs(product);
  return {
    sourceKey,
    sourceName,
    externalId: product.externalId,
    sku: product.sku,
    manufacturerCode: product.manufacturerCode,
    productName: product.productName,
    brandName: "MODAMIX",
    categoryPath: ["Banyo & Vitrifiye", "Duş Sistemleri", "Robot Duşlar"],
    categoryName: "Robot Duşlar",
    unitType: "Adet",
    taxRate: "20",
    currency: "TRY",
    listPrice: product.price,
    stockQuantity: 0,
    stockStatus: "out_of_stock",
    stockQuantityKnown: false,
    description: `${product.productName}. ${product.bullets.join(" ")} Modamix 2026 katalog liste fiyatıdır; stok bilgisi sipariş öncesinde teyit edilir.`.replace(/\s+/g, " ").trim(),
    technicalSpecs: specs,
    minOrder: 1,
    packageQuantity: 1,
    cartonQuantity: 1,
    palletQuantity: 1,
    warrantyMonths: 0,
    ...(product.imageUrl ? { imageUrl: product.imageUrl } : {}),
    sourceUrl: `Modamix 2026 04-02.pdf#page=${product.page}`,
    priceVisibleToPublic: false
  };
}

function createTechnicalSpecs(product: ParsedProduct): Array<{ label: string; value: string }> {
  const labelCounts = new Map<string, number>();
  const specs = product.bullets.map((value) => {
    const baseLabel = inferSpecLabel(value);
    const count = (labelCounts.get(baseLabel) ?? 0) + 1;
    labelCounts.set(baseLabel, count);
    return { label: count === 1 ? baseLabel : `${baseLabel} ${count}`, value };
  });
  return [
    { label: "Ürün Grubu", value: product.section },
    { label: "Model Kodu", value: product.manufacturerCode },
    ...specs,
    { label: "Katalog Sayfası", value: String(product.page) }
  ];
}

function inferSpecLabel(value: string): string {
  const normalized = value.toLocaleLowerCase("tr-TR");
  if (normalized.includes("gövde")) return "Gövde";
  if (normalized.includes("kontrol kolu")) return "Kontrol Kolu";
  if (normalized.includes("yönlendirici") || normalized.includes("dağıtıcı valf")) return "Yönlendirici";
  if (normalized.includes("batarya")) return "Batarya";
  if (normalized.includes("tepe duş") || normalized.includes("başlık")) return "Tepe Duşu";
  if (normalized.includes("el duş") || normalized.includes("shut-off")) return "El Duşu";
  if (normalized.includes("mafsal")) return "Mafsal";
  if (normalized.includes("flex")) return "Flex Hortum";
  if (normalized.includes("hortum")) return "Duş Hortumu";
  if (normalized.includes("boru")) return "Boru";
  if (normalized.includes("musluk")) return "Musluk";
  if (normalized.includes("su çıkış")) return "Su Çıkışı";
  if (normalized.includes("kurulum")) return "Kurulum Ekipmanı";
  if (/\bcm\b|\bmm\b|1\/2/.test(normalized)) return "Ölçü";
  return "Teknik Özellik";
}

function requiredPageText(pageTexts: string[], page: number): string {
  const text = pageTexts[page - 1]?.trim();
  if (!text) throw new Error(`PDF sayfa ${page} metni okunamadı.`);
  return text;
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function integerRange(start: number, end: number): number[] {
  return Array.from({ length: end - start + 1 }, (_, index) => start + index);
}

async function writeJsonAtomic(filePath: string, value: unknown): Promise<void> {
  const temporaryPath = `${filePath}.${process.pid}.${randomUUID()}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`);
  await rename(temporaryPath, filePath);
}

function requiredOption(name: string): string {
  const value = args.get(name)?.trim();
  if (!value) throw new Error(`--${name}=... zorunludur.`);
  return value;
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
