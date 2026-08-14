import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import type { ImportedSupplierProduct } from "@entas/catalog";
import { cropAndNormalizeProductImage, readProductImageMetadata } from "../apps/web/lib/product-image-normalizer";

type SeedProduct = {
  externalId: string;
  sku: string;
  name: string;
  size: string;
  group: string;
  sourcePrice: number | null;
  salePrice: number;
  imageKey: keyof typeof imageCrops;
};

const rootDir = path.resolve(import.meta.dirname, "..");
const releaseVersion = "2026-08-14-tps-pano-v1";
const releaseDir = path.join(rootDir, "deploy", "catalog-releases", releaseVersion);
const uploadSubdir = path.join("catalog-imports", "tps-pano-2026-08-14", "products");
const uploadDir = path.join(releaseDir, "uploads", uploadSubdir);
const seedPath = path.join(rootDir, "scripts", "catalog-data", "tps-pano-2026-08-14.json");
const sourceImagePath = "/Users/zumerkekillioglu/Downloads/WhatsApp Image 2026-08-14 at 13.49.28.jpeg";
const shouldWrite = process.argv.includes("--write");

const imageCrops = {
  "kollektor-dolabi": { left: 45, top: 520, width: 205, height: 205 },
  "sayac-akv-panosu": { left: 55, top: 865, width: 205, height: 310 },
  "su-sayac-panosu": { left: 40, top: 1320, width: 235, height: 285 },
  "isi-pompasi-ayagi": { left: 30, top: 1730, width: 275, height: 285 }
} as const;

async function main(): Promise<void> {
  const seeds = JSON.parse(await readFile(seedPath, "utf8")) as SeedProduct[];
  assertSeeds(seeds);
  const metadata = await readProductImageMetadata(sourceImagePath);
  if (metadata.width !== 1095 || metadata.height !== 2048) {
    throw new Error(`Beklenmeyen kaynak görsel boyutu: ${metadata.width}x${metadata.height}`);
  }
  const existingBrandCount = await countExistingBrand("TPS PANO");
  const report = {
    releaseVersion,
    productCount: seeds.length,
    pricedProductCount: seeds.filter((seed) => seed.salePrice > 0).length,
    contactPriceProductCount: seeds.filter((seed) => seed.salePrice <= 0).length,
    uniqueImageCount: new Set(seeds.map((seed) => seed.imageKey)).size,
    existingExactBrandCount: existingBrandCount,
    sourcePriceSubtotal: sum(seeds.map((seed) => seed.sourcePrice || 0)),
    salePriceSubtotal: sum(seeds.map((seed) => seed.salePrice)),
    marginRate: 25,
    mode: shouldWrite ? "write" : "dry-run"
  };
  if (!shouldWrite) {
    console.log(JSON.stringify({ ...report, products: seeds }, null, 2));
    return;
  }

  await rm(releaseDir, { recursive: true, force: true });
  await mkdir(uploadDir, { recursive: true });
  const imageUrls = new Map<string, string>();
  for (const [index, [imageKey, crop]] of Object.entries(imageCrops).entries()) {
    const normalized = await cropAndNormalizeProductImage(sourceImagePath, crop);
    const filename = `${String(index + 1).padStart(2, "0")}-${imageKey}.webp`;
    await writeFile(path.join(uploadDir, filename), normalized.buffer);
    imageUrls.set(imageKey, `/uploads/${uploadSubdir.split(path.sep).join("/")}/${filename}`);
  }
  const products = seeds.map((seed) => toImportedProduct(seed, required(imageUrls.get(seed.imageKey), seed.imageKey)));
  await writeFile(path.join(releaseDir, "products.json"), `${JSON.stringify(products, null, 2)}\n`);
  await writeFile(path.join(releaseDir, "manifest.json"), `${JSON.stringify({
    ...report,
    createdAt: new Date().toISOString(),
    source: {
      name: "TPS Pano Fiyat Listesi",
      receivedAt: "2026-08-14",
      fileName: path.basename(sourceImagePath),
      listedPricesExcludeVat: true
    },
    pricingPolicy: "Kaynak KDV hariç liste fiyatı x 1.25; iki ondalık hassasiyet. Fiyat Alınız satırları 0.00 ve CONTACT_REP.",
    imagePolicy: "Kaynak fiyat listesindeki gerçek ürün görselleri kırpıldı; 1200x1200 WebP, beyaz zemin, Lanczos3 ve kontrollü hafif keskinleştirme",
    stockPolicy: "Liste gerçek stok adedi içermiyor; stockQuantityKnown=false"
  }, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
}

function toImportedProduct(seed: SeedProduct, imageUrl: string): ImportedSupplierProduct {
  const isHeatPumpFoot = seed.group === "Isı Pompası Ayağı";
  const categoryPath = isHeatPumpFoot
    ? ["Isıtma ve Soğutma", "Isı Pompası Aksesuarları", "Isı Pompası Ayakları"]
    : ["Tesisat", "Sayaç ve Kollektör Panoları", "Metal Muhafaza Panoları"];
  return {
    sourceKey: "catalog-tps-pano-2026-08-14",
    sourceName: "TPS Pano Fiyat Listesi 2026-08-14",
    externalId: seed.externalId,
    sku: seed.sku,
    productName: `${seed.name} ${seed.size}`,
    brandName: "TPS PANO",
    categoryPath,
    categoryName: categoryPath.at(-1),
    unitType: "ADET",
    taxRate: "20",
    currency: "TRY",
    listPrice: seed.salePrice.toFixed(2),
    stockQuantity: 1,
    stockStatus: "in_stock",
    stockQuantityKnown: false,
    description: `${seed.name}; ölçü ${seed.size}. TPS Pano fiyat listesinden doğrulanmıştır.${isHeatPumpFoot ? " Genişlik ve yükseklik ayarı yapılabilir." : ""} Gerçek stok ve teslim süresi sipariş öncesinde teyit edilmelidir.`,
    technicalSpecs: [
      { label: "Marka", value: "TPS PANO" },
      { label: "Sistem Kodu", value: seed.sku },
      { label: "Ürün Grubu", value: seed.group },
      { label: "Ölçü", value: seed.size },
      { label: "Birim", value: "Adet" },
      { label: "Fiyat Kaynağı", value: seed.salePrice > 0 ? "TPS Pano 14.08.2026 KDV hariç satış listesi" : "TPS Pano listesinde Fiyat Alınız" },
      { label: "Stok", value: "Gerçek stok adedi ve teslim süresi için teyit gerekli" }
    ],
    minOrder: 1,
    packageQuantity: 1,
    cartonQuantity: 1,
    palletQuantity: 1,
    warrantyMonths: 0,
    imageUrl,
    priceVisibleToPublic: false
  };
}

function assertSeeds(seeds: SeedProduct[]): void {
  if (seeds.length !== 19) throw new Error(`19 ürün bekleniyordu, ${seeds.length} bulundu`);
  if (new Set(seeds.map((seed) => seed.externalId)).size !== seeds.length) throw new Error("Tekrarlanan externalId bulundu");
  if (new Set(seeds.map((seed) => seed.sku)).size !== seeds.length) throw new Error("Tekrarlanan SKU bulundu");
  for (const seed of seeds) {
    if (!seed.name || !seed.size || !seed.group || !(seed.imageKey in imageCrops)) throw new Error(`Eksik alan: ${seed.sku}`);
    const expected = seed.sourcePrice === null ? 0 : Number((seed.sourcePrice * 1.25).toFixed(2));
    if (seed.salePrice !== expected) throw new Error(`%25 fiyat hesabı hatalı: ${seed.sku}, ${seed.salePrice} != ${expected}`);
  }
  if (seeds.filter((seed) => seed.salePrice > 0).length !== 13) throw new Error("13 fiyatlı ürün bekleniyor");
  if (seeds.filter((seed) => seed.salePrice === 0).length !== 6) throw new Error("6 Fiyat Alınız ürünü bekleniyor");
}

async function countExistingBrand(brand: string): Promise<number> {
  try {
    const store = JSON.parse(await readFile(path.join(rootDir, "data", "catalog-store.json"), "utf8")) as { products?: Array<{ brand?: string }> };
    return (store.products || []).filter((product) => product.brand?.toLocaleUpperCase("tr-TR") === brand).length;
  } catch {
    return 0;
  }
}

function required(value: string | undefined, key: string): string {
  if (!value) throw new Error(`Görsel URL'si yok: ${key}`);
  return value;
}

function sum(values: number[]): number {
  return Number(values.reduce((total, value) => total + value, 0).toFixed(2));
}

void main();
