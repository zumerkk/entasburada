/**
 * Baki Koç 2026 fiyat listesini katalog sürüm paketine dönüştürür.
 *
 * Girdi: scripts/extract-baki-koc-pdf.py çıktısı (satırlar + şeffaf zeminden
 * beyaza oturtulmuş ana ürün görselleri).
 *
 * Fiyat kuralı (müşteri talimatı, 17.09.2026): listede görülen net fiyatın
 * üzerine %20 KDV eklenir; sitede gösterilen fiyat KDV dahildir. BAKİ KOÇ
 * markasının commercial-policy.ts içinde iskonto kuralı yoktur (net), bu yüzden
 * `listPrice` doğrudan müşterinin gördüğü KDV dahil fiyattır.
 *
 * Kullanım:
 *   node --import tsx scripts/build-baki-koc-release.ts \
 *     --rows=scripts/catalog-data/baki-koc-2026-09.json \
 *     --images=tmp/pdfs/baki-koc-2026/images
 */
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import type { ImportedSupplierProduct } from "@entas/catalog";
import { normalizeProductImage } from "../apps/web/lib/product-image-normalizer";

type ExtractedRow = {
  pdfPage: number;
  catalogPage: number;
  group: string;
  name: string;
  code: string;
  cartonQuantity: string;
  price: number;
  weight: string;
  material: string;
  thickness: string;
  image: string;
};

const VAT_RATE = 20;
const EXPECTED_PRODUCTS = 153;
const rootDir = path.resolve(import.meta.dirname, "..");
const args = new Map(process.argv.slice(2).map((argument) => {
  const [key, ...value] = argument.replace(/^--/, "").split("=");
  return [key, value.join("=") || "true"];
}));
const rowsPath = path.resolve(rootDir, args.get("rows") || "scripts/catalog-data/baki-koc-2026-09.json");
const imageDir = path.resolve(rootDir, args.get("images") || "tmp/pdfs/baki-koc-2026/images");
const releaseVersion = "2026-09-18-baki-koc-v1";
const releaseDir = path.join(rootDir, "deploy", "catalog-releases", releaseVersion);
const uploadSubdir = path.join("catalog-imports", "baki-koc-2026-09", "products");
const uploadDir = path.join(releaseDir, "uploads", uploadSubdir);
// "entas-bk" parçası catalog-classifier.ts'teki sabit kaynak kuralıyla ürünleri
// Sulama & Bahçe > Çapa, Kürek & Tarım El Aletleri altına yerleştirir.
const sourceKey = "catalog-pdf-entas-bk-baki-koc-2026-09";
const sourceName = "Baki Koç 2026 Fiyat Listesi (Eylül 2026)";
const sourceFile = "BAKİ KOÇ 2026 FİYAT LİSTESİ.pdf";

const GROUP_LABELS: Record<string, string> = {
  "PLASTİK KÜREK GRUBU": "Plastik Kürek Grubu",
  "ORİJİNAL PLASTİK KÜREK GRUBU": "Orijinal Plastik Kürek Grubu",
  "PLASTİK TIRMIK GRUBU": "Plastik Tırmık Grubu",
  "ORİJİNAL PLASTİK TIRMIK GRUBU": "Orijinal Plastik Tırmık Grubu",
  "ÇELİK GELBERİ VE ÇELİK ÇAPA GRUBU": "Çelik Gelberi ve Çelik Çapa Grubu",
  "YABA VE ÇELİK DİRGEN GRUBU": "Yaba ve Çelik Dirgen Grubu",
  "ORAK, TAHRA VE SATIR GRUBU": "Orak, Tahra ve Satır Grubu",
  "BALTA VE NACAK GRUBU": "Balta ve Nacak Grubu",
  "ÇELİK KESER VE KAZMA GRUBU": "Çelik Keser ve Kazma Grubu"
};

async function main(): Promise<void> {
  const seed = JSON.parse(await readFile(rowsPath, "utf8")) as { rows: ExtractedRow[] };
  const rows = seed.rows;
  assertRows(rows);

  await rm(releaseDir, { recursive: true, force: true });
  await mkdir(uploadDir, { recursive: true });

  const products: ImportedSupplierProduct[] = [];
  for (const row of rows) {
    const key = codeKey(row.code);
    const normalized = await normalizeProductImage(path.join(imageDir, row.image));
    await writeFile(path.join(uploadDir, `bk-${key.toLowerCase()}.webp`), normalized.buffer);
    products.push(toImportedProduct(row, `/uploads/${uploadSubdir.split(path.sep).join("/")}/bk-${key.toLowerCase()}.webp`));
  }

  await writeFile(path.join(releaseDir, "products.json"), `${JSON.stringify(products, null, 2)}\n`);
  const manifest = {
    version: releaseVersion,
    createdAt: new Date().toISOString(),
    source: { name: sourceName, fileName: sourceFile, receivedAt: "2026-09-17", pageCount: 72 },
    sourceKey,
    productCount: products.length,
    imageCount: products.length,
    groupCounts: countBy(rows, (row) => GROUP_LABELS[row.group] ?? row.group),
    sourcePriceSubtotal: roundMoney(rows.reduce((sum, row) => sum + row.price, 0)),
    salePriceSubtotal: roundMoney(products.reduce((sum, product) => sum + Number(product.listPrice), 0)),
    pricingPolicy: "Liste net fiyatı + %20 KDV (x1,20), iki ondalık; sitede KDV dahil gösterilir. BAKİ KOÇ markasına ek iskonto/kâr uygulanmaz.",
    stockPolicy: "Liste gerçek stok adedi içermiyor; stockQuantityKnown=false",
    imagePolicy: "PDF gömülü ürün görseli + yumuşak maske, sayfadaki yönelim korunarak beyaz zemine; 1200x1200 WebP (product-image-normalizer)",
    classification: "sourceKey 'entas-bk' içerdiği için Sulama & Bahçe > Çapa, Kürek & Tarım El Aletleri"
  };
  await writeFile(path.join(releaseDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(JSON.stringify(manifest, null, 2));
}

function toImportedProduct(row: ExtractedRow, imageUrl: string): ImportedSupplierProduct {
  const key = codeKey(row.code);
  const code = displayCode(row.code);
  const group = GROUP_LABELS[row.group];
  if (!group) throw new Error(`Tanımsız ürün grubu: ${row.group}`);
  const name = `${titleCase(cleanName(row.name))} - ${code}`;
  const weight = normalizeWeight(row.weight);
  const material = normalizeMaterial(row.material);
  const carton = Number.parseInt(row.cartonQuantity, 10);
  const forged = row.thickness.toLocaleUpperCase("tr-TR") === "DÖVME";
  const thickness = forged ? "" : row.thickness.replace(/\s*MM$/i, " mm");
  const salePrice = roundMoney(row.price * (1 + VAT_RATE / 100));

  return {
    sourceKey,
    sourceName,
    externalId: key,
    sku: `BK-${key}`,
    manufacturerCode: code,
    productName: name,
    brandName: "BAKİ KOÇ",
    categoryPath: ["Tarım & Bahçe El Aletleri", group],
    categoryName: group,
    unitType: "ADET",
    taxRate: String(VAT_RATE),
    currency: "TRY",
    listPrice: salePrice.toFixed(2),
    stockQuantity: 1,
    stockStatus: "in_stock",
    stockQuantityKnown: false,
    description: [
      `${titleCase(cleanName(row.name))}; Baki Koç ${group.toLocaleLowerCase("tr-TR")} ürünü (ürün kodu ${code}).`,
      material ? `Hammadde: ${material}.` : "",
      weight ? `Ağırlık: ${weight}.` : "",
      thickness ? `Kalınlık: ${thickness}.` : "",
      forged ? "Dövme üretim." : "",
      Number.isFinite(carton) && carton > 0 ? `Koli içi ${carton} adet.` : "",
      "Gösterilen fiyat KDV dahildir; gerçek stok ve teslim süresi sipariş öncesinde teyit edilir."
    ].filter(Boolean).join(" "),
    technicalSpecs: [
      { label: "Marka", value: "BAKİ KOÇ" },
      { label: "Ürün Kodu", value: code },
      { label: "Ürün Grubu", value: group },
      ...(material ? [{ label: "Hammadde", value: material }] : []),
      ...(weight ? [{ label: "Ağırlık", value: weight }] : []),
      ...(thickness ? [{ label: "Kalınlık", value: thickness }] : []),
      ...(forged ? [{ label: "Üretim", value: "Dövme" }] : []),
      ...(Number.isFinite(carton) && carton > 0 ? [{ label: "Koli İçi Adet", value: String(carton) }] : []),
      { label: "KDV", value: `Dahil (%${VAT_RATE})` },
      { label: "Stok", value: "Stok teyidi gerekli; kaynak liste gerçek adet vermez" },
      { label: "2026 Katalog Sayfası", value: String(row.catalogPage) }
    ],
    minOrder: 1,
    packageQuantity: 1,
    cartonQuantity: Number.isFinite(carton) && carton > 0 ? carton : 1,
    palletQuantity: 1,
    warrantyMonths: 0,
    imageUrl,
    sourceUrl: `${sourceFile}#page=${row.pdfPage}`,
    priceVisibleToPublic: false
  };
}

/** "561 - ÜÇG" -> "561-UCG": SKU ve dosya adında ASCII anahtar. */
function codeKey(code: string): string {
  return asciiUpper(code).replace(/[^A-Z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function displayCode(code: string): string {
  return code.replace(/\s*-\s*/g, "-").trim();
}

function cleanName(value: string): string {
  return value
    .replace(/ORİJINAL/g, "ORİJİNAL")
    .replace(/(\d)CM\b/g, "$1 CM")
    .replace(/[’`]/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

/** Türkçe başlık biçimi: "BİLEZİKLİ PLASTİK 3 NO FARYAP (UCU METAL)" -> "Bilezikli Plastik 3 No Faryap (Ucu Metal)". */
function titleCase(value: string): string {
  const lower = value.toLocaleLowerCase("tr-TR");
  return lower
    .split(" ")
    .map((word) => {
      if (word === "cm" || word === "kg" || word === "ve") return word;
      const index = word.search(/[a-zçğıöşüi]/);
      if (index < 0) return word;
      // "3'lü" gibi kesme işaretli sayılarda ek küçük kalır.
      if (index > 0 && word[index - 1] === "'") return word;
      return `${word.slice(0, index)}${word[index]!.toLocaleUpperCase("tr-TR")}${word.slice(index + 1)}`;
    })
    .join(" ");
}

function normalizeWeight(value: string): string {
  const digits = value.replace(/gr/i, "").replace(/\s+/g, "");
  if (!digits) return "";
  // Kaynakta "1,210 gr" binlik ayraç, "41 0 gr" bozuk boşluk olarak geçiyor.
  const grams = Number.parseInt(digits.replace(/[.,]/g, ""), 10);
  if (!Number.isFinite(grams) || grams <= 0) throw new Error(`Ağırlık okunamadı: ${value}`);
  return `${grams.toLocaleString("tr-TR")} gr`;
}

function normalizeMaterial(value: string): string {
  return value
    .replace(/\s+/g, " ")
    .replace(/(\d{4}) ÇELİK\/STEEL/g, "$1 Çelik")
    .replace(/65 ?MN YAY ÇELİĞİ/g, "65Mn Yay Çeliği")
    .replace(/DKP SAC/g, "DKP Sac")
    .replace(/ - /g, " / ")
    .trim();
}

function assertRows(rows: ExtractedRow[]): void {
  if (rows.length !== EXPECTED_PRODUCTS) throw new Error(`Beklenen ${EXPECTED_PRODUCTS} ürün yerine ${rows.length} satır var.`);
  const keys = new Set(rows.map((row) => codeKey(row.code)));
  if (keys.size !== rows.length) throw new Error("Ürün kodları benzersiz değil.");
  const invalid = rows.filter((row) => !row.name || !row.code || !(row.price > 0) || !row.image || !GROUP_LABELS[row.group]);
  if (invalid.length) throw new Error(`${invalid.length} satır eksik veya geçersiz: ${invalid.map((row) => row.code).join(", ")}`);
}

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function asciiUpper(value: string): string {
  return value
    .toLocaleUpperCase("tr-TR")
    .replace(/Ç/g, "C")
    .replace(/Ğ/g, "G")
    .replace(/[İI]/g, "I")
    .replace(/Ö/g, "O")
    .replace(/Ş/g, "S")
    .replace(/Ü/g, "U");
}

function countBy<T>(items: T[], key: (item: T) => string): Record<string, number> {
  return items.reduce<Record<string, number>>((counts, item) => {
    const value = key(item);
    counts[value] = (counts[value] ?? 0) + 1;
    return counts;
  }, {});
}

void main().catch(async (error) => {
  console.error(error instanceof Error ? error.message : String(error));
  await rm(releaseDir, { recursive: true, force: true });
  process.exitCode = 1;
});
