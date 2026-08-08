import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import type { ImportedSupplierProduct } from "@entas/catalog";
import {
  cropAndNormalizeProductImage,
  normalizeProductImage,
  readProductImageMetadata,
  type ProductImageCropRegion
} from "../apps/web/lib/product-image-normalizer";

type CropRatio = { left: number; top: number; width: number; height: number };
type ProductSeed = {
  source: "bath" | "mirror";
  code: string;
  name: string;
  category: "Banyo Mobilyaları" | "Banyo Aksesuarları" | "Vitrifiye Malzemeleri";
  price: number;
  page: number;
  imageKey: string;
  imageSource: string;
  description: string;
  specs: Array<{ label: string; value: string }>;
  crop?: CropRatio;
};

type CabinetSeed = {
  code: string;
  collection: string;
  size: number;
  price: number;
  page: number;
  imageKey: string;
  imageSource: string;
  topModule: number;
  baseModule: number;
  washbasin: string;
  washbasinPrice: number;
  crop?: CropRatio;
};

type TallCabinetSeed = {
  code: string;
  collection: string;
  price: number;
  page: number;
  imageKey: string;
  imageSource: string;
  crop: CropRatio;
};

type MirrorFamily = {
  code: string;
  model: string;
  page: number;
  imageSource: string;
  features: string[];
  variants: Array<{ size: string; price: number }>;
};

const rootDir = path.resolve(import.meta.dirname, "..");
const releaseVersion = "2026-08-09-karen-banyo-v1";
const releaseDir = path.join(rootDir, "deploy", "catalog-releases", releaseVersion);
const uploadSubdir = path.join("catalog-imports", "karen-banyo-2026-1", "products");
const uploadDir = path.join(releaseDir, "uploads", uploadSubdir);
const rawKarenDir = path.join(rootDir, "tmp", "pdfs", "karen", "embedded");
const rawMirrorDir = path.join(rootDir, "tmp", "pdfs", "ayna", "embedded");

const cabinets: CabinetSeed[] = [
  cabinet("FIRUZE-85", "FİRUZE", 85, 44366, 2, "firuze-85", "page-02/img-45-5.png", 14762, 26370, "Star 85", 3234),
  cabinet("LIANA-100", "LİANA", 100, 31196, 2, "liana-100", "page-02/img-42-2.png", 9340, 17800, "Sky 100", 4056),
  cabinet("LIANA-80", "LİANA", 80, 26354, 2, "liana-80", "page-02/img-43-3.png", 7458, 15800, "Sky 80", 3096),
  cabinet("LIANA-60", "LİANA", 60, 23672, 2, "liana-60", "page-02/img-44-4.png", 6508, 14500, "Sky 60", 2664),
  cabinet("LARA-100", "LARA", 100, 29648, 3, "lara-100", "page-03/img-69-2.png", 9192, 16400, "Sky 100", 4056),
  cabinet("LARA-80", "LARA", 80, 25030, 3, "lara-80", "page-03/img-70-3.png", 7418, 14516, "Sky 80", 3096),
  cabinet("BEGONVIL-80", "BEGONVİL", 80, 20346, 3, "begonvil", "page-03/img-82-6.png", 6650, 10600, "Sky 80", 3096),
  cabinet("BEGONVIL-60", "BEGONVİL", 60, 18162, 3, "begonvil", "page-03/img-82-6.png", 6098, 9400, "Sky 60", 2664),
  cabinet("YAGMUR-80", "YAĞMUR", 80, 21554, 4, "yagmur", "page-04/img-1073-2.png", 7458, 11000, "Sky 80", 3096),
  cabinet("YAGMUR-60", "YAĞMUR", 60, 18972, 4, "yagmur", "page-04/img-1073-2.png", 6508, 9800, "Sky 60", 2664),
  cabinet("NERO-85", "NERO", 85, 11314, 4, "nero-85", "page-04/img-101-5.png", 2460, 5620, "Star 85", 3234),
  cabinet("TERRA-80", "TERRA", 80, 15106, 4, "terra", "page-04/img-102-6.png", 4800, 7210, "Sky 80", 3096),
  cabinet("TERRA-60", "TERRA", 60, 13584, 4, "terra", "page-04/img-102-6.png", 4660, 6260, "Sky 60", 2664),
  cabinet("ARIN-100", "ARİN", 100, 20872, 5, "arin-100", "page-05/img-1139-2.png", 7216, 9600, "Sky 100", 4056),
  cabinet("ARIN-80", "ARİN", 80, 15950, 5, "arin-80-60", "page-05/img-127-5.png", 5454, 7400, "Sky 80", 3096),
  cabinet("ARIN-60", "ARİN", 60, 14016, 5, "arin-80-60", "page-05/img-127-5.png", 4852, 6500, "Sky 60", 2664),
  cabinet("ARIN-50", "ARİN", 50, 11028, 5, "arin-50", "page-05/img-125-3.png", 3794, 5100, "Sky 50", 2134),
  cabinet("VENUS-100", "VENÜS", 100, 19402, 6, "venus-100", "page-06/img-145-3.png", 7546, 7800, "Sky 100", 4056),
  cabinet("VENUS-80", "VENÜS", 80, 14728, 6, "venus-80", "page-06/img-1189-2.png", 5632, 6000, "Sky 80", 3096),
  cabinet("VENUS-60", "VENÜS", 60, 13128, 6, "venus-60", "page-06/img-146-4.png", 5064, 5400, "Sky 60", 2664),
  cabinet("VENUS-50", "VENÜS", 50, 10868, 6, "venus-50", "page-06/img-154-6.png", 4334, 4400, "Sky 50", 2134),
  cabinet("VENUS-45", "VENÜS", 45, 7476, 6, "venus-45", "page-06/img-153-5.png", 1904, 4000, "Sky 45", 1572),
  cabinet("AURA-80", "AURA", 80, 14096, 7, "aura", "page-07/img-166-2.png", 5130, 5870, "Sky 80", 3096),
  cabinet("AURA-60", "AURA", 60, 12578, 7, "aura", "page-07/img-166-2.png", 4710, 5204, "Sky 60", 2664),
  cabinet("LILYUM-80", "LİLYUM", 80, 11300, 7, "lilyum", "page-07/img-1240-4.png", 4276, 3928, "Sky 80", 3096),
  cabinet("LILYUM-60", "LİLYUM", 60, 10300, 7, "lilyum", "page-07/img-1240-4.png", 4060, 3576, "Sky 60", 2664),
  cabinet("DAFNE-85", "DAFNE", 85, 12200, 7, "dafne", "page-07/img-1245-6.png", 4676, 4290, "Star 85", 3234),
  cabinet("DAFNE-65", "DAFNE", 65, 10800, 7, "dafne", "page-07/img-1245-6.png", 4387, 3839, "Star 65", 2574),
  cabinet("DALLAS-80", "DALLAS", 80, 13610, 8, "dallas", "page-08/img-192-2.png", 5314, 5200, "Sky 80", 3096),
  cabinet("DALLAS-60", "DALLAS", 60, 12644, 8, "dallas", "page-08/img-192-2.png", 4780, 5200, "Sky 60", 2664),
  cabinet("KOZA-80", "KOZA", 80, 10042, 8, "koza-80", "page-08/img-194-6.png", 3720, 3226, "Sky 80", 3096),
  cabinet("KOZA-60", "KOZA", 60, 8548, 8, "koza-60", "page-08/img-195-7.png", 2890, 2994, "Sky 60", 2664),
  cabinet("KOZA-50", "KOZA", 50, 6600, 8, "koza-50", "../rendered-high/page-08.jpg", 2315, 2151, "Sky 50", 2134, { left: 0.14, top: 0.835, width: 0.09, height: 0.12 }),
  cabinet("ARYA-80", "ARYA", 80, 10942, 9, "arya-80", "page-09/img-1380-2.png", 4376, 3470, "Sky 80", 3096),
  cabinet("ARYA-60", "ARYA", 60, 9146, 9, "arya-60", "page-09/img-223-5.png", 3246, 3236, "Sky 60", 2664)
];

const tallCabinets: TallCabinetSeed[] = [
  tall("LIANA", "LİANA", 12900, 2, "liana-boy", "page-02/img-58-6.png", { left: 0.72, top: 0.05, width: 0.23, height: 0.9 }),
  tall("LARA", "LARA", 13982, 3, "lara-boy", "../rendered-high/page-03.jpg", { left: 0.17, top: 0.378, width: 0.06, height: 0.115 }),
  tall("BEGONVIL", "BEGONVİL", 12392, 3, "begonvil-boy", "page-03/img-1036-5.png", { left: 0.71, top: 0.05, width: 0.23, height: 0.9 }),
  tall("YAGMUR", "YAĞMUR", 13100, 4, "yagmur-boy", "page-04/img-1073-2.png", { left: 0.72, top: 0.05, width: 0.22, height: 0.9 }),
  tall("ARIN", "ARİN", 7358, 5, "arin-boy", "page-05/img-1139-2.png", { left: 0.72, top: 0.05, width: 0.22, height: 0.9 }),
  tall("VENUS", "VENÜS", 6196, 6, "venus-boy", "page-06/img-1189-2.png", { left: 0.69, top: 0.06, width: 0.26, height: 0.88 }),
  tall("DALLAS", "DALLAS", 5680, 8, "dallas-boy", "../rendered-high/page-08.jpg", { left: 0.14, top: 0.385, width: 0.07, height: 0.1 })
];

const countertops: ProductSeed[] = [
  simpleProduct("bath", "TZG-MESE-100", "KAREN Meşe Tezgâh 100 cm", "Banyo Mobilyaları", 4442, 9, "tezgah-mese", "page-09/img-221-3.png", "Meşe görünümlü 100 cm lavabo tezgâhı.", [["Malzeme / Renk", "Meşe (Oak)"], ["Ölçü", "100 cm"]]),
  simpleProduct("bath", "TZG-MESE-80", "KAREN Meşe Tezgâh 80 cm", "Banyo Mobilyaları", 3680, 9, "tezgah-mese", "page-09/img-221-3.png", "Meşe görünümlü 80 cm lavabo tezgâhı.", [["Malzeme / Renk", "Meşe (Oak)"], ["Ölçü", "80 cm"]]),
  simpleProduct("bath", "TZG-ITALYAN-CEVIZ-100", "KAREN İtalyan Ceviz Tezgâh 100 cm", "Banyo Mobilyaları", 4252, 9, "tezgah-italyan-ceviz", "page-09/img-222-4.png", "İtalyan ceviz görünümlü 100 cm lavabo tezgâhı.", [["Malzeme / Renk", "İtalyan Ceviz (Italian Walnut)"], ["Ölçü", "100 cm"]]),
  simpleProduct("bath", "TZG-ITALYAN-CEVIZ-80", "KAREN İtalyan Ceviz Tezgâh 80 cm", "Banyo Mobilyaları", 3530, 9, "tezgah-italyan-ceviz", "page-09/img-222-4.png", "İtalyan ceviz görünümlü 80 cm lavabo tezgâhı.", [["Malzeme / Renk", "İtalyan Ceviz (Italian Walnut)"], ["Ölçü", "80 cm"]])
];

const washbasins: ProductSeed[] = [
  washbasin("OCEAN", "OCEAN Tezgâh Üstü Lavabo 65x36 cm", 4370, 11, "lavabo-ocean", "page-11/img-248-5.jpeg", "Tezgâh üstü lavabo", "65x36 cm"),
  washbasin("FLY", "FLY Tezgâh Üstü Lavabo 48x48 cm", 5168, 11, "lavabo-fly", "page-11/img-247-4.jpeg", "Tezgâh üstü lavabo", "48x48 cm"),
  washbasin("AWARD-60", "AWARD 60 Tezgâh Üstü Lavabo", 3932, 11, "lavabo-award-60", "page-11/img-245-2.jpeg", "Tezgâh üstü lavabo", "60 cm"),
  washbasin("AWARD-50", "AWARD 50 Tezgâh Üstü Lavabo", 3812, 11, "lavabo-award-50", "page-11/img-246-3.jpeg", "Tezgâh üstü lavabo", "50 cm"),
  washbasin("MOTION-45", "MOTION 45 Tezgâh Üstü Lavabo", 3280, 11, "lavabo-motion-45", "page-11/img-250-7.jpeg", "Tezgâh üstü lavabo", "45 cm"),
  washbasin("GALAKSI", "GALAKSİ Tezgâh Üstü Lavabo", 3280, 11, "lavabo-galaksi", "page-11/img-249-6.png", "Tezgâh üstü lavabo"),
  washbasin("PARADISE", "PARADİSE Tezgâh Üstü Lavabo", 3930, 11, "lavabo-paradise", "page-11/img-251-8.jpeg", "Tezgâh üstü lavabo"),
  washbasin("STAR-100", "STAR 100 Etajerli Lavabo", 3770, 12, "lavabo-star-100", "page-12/img-279-2.jpeg", "Etajerli lavabo", "100 cm"),
  washbasin("STAR-85", "STAR 85 Etajerli Lavabo", 3234, 12, "lavabo-star-85", "page-12/img-280-3.jpeg", "Etajerli lavabo", "85 cm"),
  washbasin("STAR-65", "STAR 65 Etajerli Lavabo", 2574, 12, "lavabo-star-65", "page-12/img-281-4.jpeg", "Etajerli lavabo", "65 cm"),
  washbasin("SKY-100", "SKY 100 Etajerli Lavabo", 4056, 12, "lavabo-sky-100", "page-12/img-282-5.jpeg", "Etajerli lavabo", "100 cm"),
  washbasin("SKY-80", "SKY 80 Etajerli Lavabo", 3096, 12, "lavabo-sky-80", "page-12/img-283-6.jpeg", "Etajerli lavabo", "80 cm"),
  washbasin("SKY-60", "SKY 60 Etajerli Lavabo", 2664, 12, "lavabo-sky-60", "page-12/img-284-7.jpeg", "Etajerli lavabo", "60 cm"),
  washbasin("SKY-50", "SKY 50 Etajerli Lavabo", 2134, 12, "lavabo-sky-50", "page-12/img-285-8.jpeg", "Etajerli lavabo", "50 cm"),
  washbasin("BLANC-70", "BLANC 70 Etajerli Lavabo", 2848, 13, "lavabo-blanc-70", "page-13/img-313-2.jpeg", "Etajerli lavabo", "70 cm"),
  washbasin("SENSE", "SENSE Etajerli Lavabo", 1572, 13, "lavabo-sense", "page-13/img-314-3.jpeg", "Etajerli lavabo"),
  washbasin("TINY", "TINY Etajerli Lavabo", 766, 13, "lavabo-tiny", "page-13/img-315-4.jpeg", "Etajerli lavabo")
];

const mirrorFamilies: MirrorFamily[] = [
  mirrorFamily("SILVA", "SİLVA", 1, "page-01/img-215-0.png", ["Beyaz ışık", "Dokunmatik kontrol", "Buğu önleyici", "220V direkt bağlantı"], [["60x80 cm", 2000]]),
  mirrorFamily("ASTER", "ASTER", 1, "page-01/img-234-2.png", ["Gün ışığı", "Dokunmatik kontrol", "220V direkt bağlantı"], [["50 cm", 850], ["60 cm", 1000], ["80 cm", 1400]]),
  mirrorFamily("AQUA", "AQUA", 1, "page-01/img-263-3.png", ["Beyaz ışık", "220V direkt bağlantı"], [["60x80 cm", 1600]]),
  mirrorFamily("ALKA", "ALKA", 1, "page-01/img-277-4.png", ["Gün ışığı", "Buğu önleyici", "220V direkt bağlantı"], [["60x80 cm", 1800]]),
  mirrorFamily("TETRA", "TETRA", 1, "page-01/img-291-5.png", ["Gün ışığı", "Buğu önleyici", "220V direkt bağlantı"], [["80x60 cm", 1800]]),
  mirrorFamily("HAZE", "HAZE", 2, "page-02/img-306-0.png", ["Beyaz ışık", "220V direkt bağlantı"], [["60x80 cm", 1600]]),
  mirrorFamily("SORA", "SORA", 2, "page-02/img-319-2.png", ["Gün ışığı", "220V direkt bağlantı"], [["60 cm", 1250], ["70 cm", 1450], ["80 cm", 1800], ["90 cm", 2100]]),
  mirrorFamily("VITA", "VİTA", 2, "page-02/img-336-3.png", ["Gün ışığı", "220V direkt bağlantı"], [["60 cm", 1300], ["70 cm", 1500], ["80 cm", 1850], ["90 cm", 2150]]),
  mirrorFamily("MILA", "MİLA", 2, "page-02/img-353-4.png", ["Gün ışığı", "220V direkt bağlantı"], [["50 cm", 750], ["60 cm", 900], ["80 cm", 1300]])
];

async function main(): Promise<void> {
  const seeds = [
    ...cabinets.map(cabinetProduct),
    ...tallCabinets.map(tallCabinetProduct),
    ...countertops,
    ...washbasins,
    ...mirrorFamilies.flatMap(mirrorProducts)
  ];
  assertReleaseSeeds(seeds);
  await rm(releaseDir, { recursive: true, force: true });
  await mkdir(uploadDir, { recursive: true });

  const imageUrls = new Map<string, string>();
  for (const seed of seeds) {
    if (imageUrls.has(seed.imageKey)) continue;
    const sourcePath = path.join(seed.source === "mirror" ? rawMirrorDir : rawKarenDir, seed.imageSource);
    const outputPath = path.join(uploadDir, `${seed.imageKey}.webp`);
    const normalized = seed.crop
      ? await cropAndNormalizeProductImage(sourcePath, await cropRegion(sourcePath, seed.crop))
      : await normalizeProductImage(sourcePath);
    await writeFile(outputPath, normalized.buffer);
    imageUrls.set(seed.imageKey, `/uploads/${uploadSubdir.split(path.sep).join("/")}/${seed.imageKey}.webp`);
  }

  const products = seeds.map((seed) => toImportedProduct(seed, imageUrls.get(seed.imageKey)!));
  await writeFile(path.join(releaseDir, "products.json"), `${JSON.stringify(products, null, 2)}\n`);
  const manifest = {
    version: releaseVersion,
    createdAt: new Date().toISOString(),
    sourceCounts: countBy(products, (product) => product.sourceKey),
    productCount: products.length,
    imageCount: imageUrls.size,
    pricingPolicy: "KAREN liste fiyatı - %30; fiyatlar KDV dahil gösterilir",
    stockPolicy: "Stokta var; kaynak PDF gerçek adet vermediği için stockQuantityKnown=false",
    imagePolicy: "PDF gömülü orijinal görselleri, 1200x1200 WebP, Lanczos3 ve hafif keskinleştirme"
  };
  await writeFile(path.join(releaseDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(JSON.stringify(manifest, null, 2));
}

function cabinet(
  code: string,
  collection: string,
  size: number,
  price: number,
  page: number,
  imageKey: string,
  imageSource: string,
  topModule: number,
  baseModule: number,
  washbasinName: string,
  washbasinPrice: number,
  crop?: CropRatio
): CabinetSeed {
  return { code, collection, size, price, page, imageKey, imageSource, topModule, baseModule, washbasin: washbasinName, washbasinPrice, ...(crop ? { crop } : {}) };
}

function tall(code: string, collection: string, price: number, page: number, imageKey: string, imageSource: string, crop: CropRatio): TallCabinetSeed {
  return { code, collection, price, page, imageKey, imageSource, crop };
}

function cabinetProduct(seed: CabinetSeed): ProductSeed {
  return {
    source: "bath",
    code: `BNY-${seed.code}`,
    name: `KAREN ${seed.collection} ${seed.size} Banyo Dolabı Takımı`,
    category: "Banyo Mobilyaları",
    price: seed.price,
    page: seed.page,
    imageKey: seed.imageKey,
    imageSource: seed.imageSource,
    ...(seed.crop ? { crop: seed.crop } : {}),
    description: `${seed.collection} ${seed.size} banyo mobilyası; üst modül, alt lavabo modülü ve ${seed.washbasin} lavabodan oluşan takım.`,
    specs: [
      { label: "Koleksiyon", value: seed.collection },
      { label: "Ölçü", value: `${seed.size} cm` },
      { label: "Paket İçeriği", value: `Üst modül + alt lavabo modülü + ${seed.washbasin} lavabo` },
      { label: "Üst Modül Liste Değeri", value: formatTry(seed.topModule) },
      { label: "Alt Modül Liste Değeri", value: formatTry(seed.baseModule) },
      { label: "Lavabo", value: `${seed.washbasin} (${formatTry(seed.washbasinPrice)})` }
    ]
  };
}

function tallCabinetProduct(seed: TallCabinetSeed): ProductSeed {
  return {
    source: "bath",
    code: `BNY-${seed.code}-BOY`,
    name: `KAREN ${seed.collection} Boy Dolabı`,
    category: "Banyo Mobilyaları",
    price: seed.price,
    page: seed.page,
    imageKey: seed.imageKey,
    imageSource: seed.imageSource,
    crop: seed.crop,
    description: `${seed.collection} koleksiyonuna ait yüksek banyo dolabı.`,
    specs: [
      { label: "Koleksiyon", value: seed.collection },
      { label: "Ürün Tipi", value: "Boy dolabı / High cabinet" }
    ]
  };
}

function washbasin(code: string, name: string, price: number, page: number, imageKey: string, imageSource: string, type: string, size?: string): ProductSeed {
  return simpleProduct(
    "bath",
    `LVB-${code}`,
    `KAREN ${name}`,
    "Vitrifiye Malzemeleri",
    price,
    page,
    imageKey,
    imageSource,
    `${name}; KAREN vitrifiye koleksiyonu.`,
    [["Ürün Tipi", type], ...(size ? [["Ölçü", size] as [string, string]] : [])]
  );
}

function mirrorFamily(code: string, model: string, page: number, imageSource: string, features: string[], variants: Array<[string, number]>): MirrorFamily {
  return { code, model, page, imageSource, features, variants: variants.map(([size, price]) => ({ size, price })) };
}

function mirrorProducts(family: MirrorFamily): ProductSeed[] {
  return family.variants.map((variant) => simpleProduct(
    "mirror",
    `AYN-${family.code}-${skuPart(variant.size)}`,
    `KAREN ${family.model} LED Ayna ${variant.size}`,
    "Banyo Aksesuarları",
    variant.price,
    family.page,
    `ayna-${family.code.toLowerCase()}`,
    family.imageSource,
    `${family.model} LED banyo aynası; ${family.features.join(", ").toLocaleLowerCase("tr-TR")}.`,
    [["Model", family.model], ["Ölçü", variant.size], ...family.features.map((feature) => ["Özellik", feature] as [string, string])]
  ));
}

function simpleProduct(
  source: "bath" | "mirror",
  code: string,
  name: string,
  category: ProductSeed["category"],
  price: number,
  page: number,
  imageKey: string,
  imageSource: string,
  description: string,
  specs: Array<[string, string]>
): ProductSeed {
  return { source, code, name, category, price, page, imageKey, imageSource, description, specs: specs.map(([label, value]) => ({ label, value })) };
}

function toImportedProduct(seed: ProductSeed, imageUrl: string): ImportedSupplierProduct {
  const sku = `KRN-${seed.code}`;
  const sourceKey = seed.source === "mirror" ? "catalog-pdf-karen-led-ayna-2026" : "catalog-pdf-karen-banyo-2026-1-revize";
  const sourceName = seed.source === "mirror" ? "KAREN LED Ayna Fiyat Listesi 2026" : "KAREN Banyo 2026-1 Revize Fiyat Listesi";
  const sourceFile = seed.source === "mirror" ? "AYNA FİYAT LİSTESİ.pdf" : "KAREN BANYO 2026-1 REVİZE FİYAT LİSTESİ.pdf";
  return {
    sourceKey,
    sourceName,
    externalId: sku,
    sku,
    manufacturerCode: sku,
    productName: seed.name,
    brandName: "KAREN",
    categoryPath: ["Banyo & Vitrifiye", seed.category],
    categoryName: seed.category,
    unitType: "ADET",
    taxRate: "20",
    currency: "TRY",
    listPrice: seed.price.toFixed(2),
    stockQuantity: 1,
    stockStatus: "in_stock",
    stockQuantityKnown: false,
    description: `${seed.description} Liste fiyatına KAREN marka %30 iskonto uygulanır; gösterilen satış fiyatı KDV dahildir.`,
    technicalSpecs: [
      ...seed.specs,
      { label: "İskonto", value: "%30" },
      { label: "KDV", value: "Dahil (%20)" },
      { label: "Stok", value: "Stokta var; gerçek adet kaynak listede belirtilmemiştir" },
      { label: "Kaynak Sayfa", value: String(seed.page) }
    ],
    minOrder: 1,
    packageQuantity: 1,
    cartonQuantity: 1,
    palletQuantity: 1,
    warrantyMonths: 0,
    imageUrl,
    sourceUrl: `${sourceFile}#page=${seed.page}`,
    priceVisibleToPublic: false
  };
}

async function cropRegion(sourcePath: string, ratio: CropRatio): Promise<ProductImageCropRegion> {
  const metadata = await readProductImageMetadata(sourcePath);
  const left = Math.floor(metadata.width * ratio.left);
  const top = Math.floor(metadata.height * ratio.top);
  return {
    left,
    top,
    width: Math.min(metadata.width - left, Math.floor(metadata.width * ratio.width)),
    height: Math.min(metadata.height - top, Math.floor(metadata.height * ratio.height))
  };
}

function assertReleaseSeeds(seeds: ProductSeed[]): void {
  if (seeds.length !== 82) throw new Error(`Beklenen 82 ürün yerine ${seeds.length} ürün üretildi.`);
  const codes = new Set(seeds.map((seed) => seed.code));
  if (codes.size !== seeds.length) throw new Error("Ürün kodları benzersiz değil.");
  const invalid = seeds.filter((seed) => !seed.name || seed.price <= 0 || seed.page <= 0 || !seed.imageSource);
  if (invalid.length) throw new Error(`${invalid.length} ürün kaydı eksik veya geçersiz.`);
}

function countBy<T>(items: T[], key: (item: T) => string): Record<string, number> {
  return items.reduce<Record<string, number>>((counts, item) => {
    const value = key(item);
    counts[value] = (counts[value] ?? 0) + 1;
    return counts;
  }, {});
}

function formatTry(value: number): string {
  return `${value.toLocaleString("tr-TR")} TL`;
}

function skuPart(value: string): string {
  return value
    .toLocaleUpperCase("tr-TR")
    .replace(/[Ç]/g, "C")
    .replace(/[Ğ]/g, "G")
    .replace(/[İI]/g, "I")
    .replace(/[Ö]/g, "O")
    .replace(/[Ş]/g, "S")
    .replace(/[Ü]/g, "U")
    .replace(/[^A-Z0-9]+/g, "X")
    .replace(/^X+|X+$/g, "");
}

void main().catch(async (error) => {
  const message = error instanceof Error ? error.message : String(error);
  try {
    await readFile(path.join(releaseDir, "manifest.json"));
  } catch {
    await rm(releaseDir, { recursive: true, force: true });
  }
  console.error(message);
  process.exitCode = 1;
});
