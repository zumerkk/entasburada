/**
 * KAREN LED ayna fiyat duzeltmesi: tedarikci alis listesi + %40 kar, NET fiyat.
 *
 * NEDEN AYRI BIR SCRIPT:
 * 1) `build-price-markup-release.ts` yerel gorselli urunleri reddeder (satir 61);
 *    aynalar `/uploads/...` gorseli kullaniyor. Gorseller zaten canli diskte
 *    (`2026-08-09-karen-banyo-v1` ile gitti), yeniden tasinmalari gerekmiyor.
 * 2) O script yalnizca fiyati carpar; burada ayrica urun metnindeki artik yanlis
 *    olan "%30 iskonto" ifadesinin de temizlenmesi gerekiyor.
 *
 * DUZELTILEN HATA (2026-08-25 denetimi):
 * PDF ("AYNA FIYAT LISTESI", KAREN tedarikci listesi) fiyatlari depoya
 * `listPrice` olarak oldugu gibi girilmis. Ancak Karen markasinin fiyat kurali
 * `discount %30` oldugu icin bayiye `listPrice x 0,70` gosteriliyordu; yani
 * SILVA 2.000 TL alis, bayiye 1.400 TL. 19 urunde birim basina -8.520 TL zarar.
 *
 * COZUM (iki parca, ikisi de gerekli):
 *  a) `commercial-policy.ts` -> bu kaynak icin `net` politikasi (iskonto yok).
 *  b) Bu paket -> `listPrice` = PDF alis fiyati x 1,40 (kar marji fiyata gomulu).
 * Sonuc: bayi SILVA icin 2.800 TL goruyor.
 *
 * IDEMPOTENT: Yeni fiyat depodaki mevcut fiyattan degil, asagidaki PDF
 * tablosundan hesaplanir. Script iki kez calissa da sonuc ayni kalir (depodan
 * carpsaydi 2.000 -> 2.800 -> 3.920 olurdu).
 *
 * Ornek:
 *   pnpm karen:led-ayna:build -- \
 *     --release=deploy/catalog-releases/2026-08-25-karen-led-ayna-net-kar40-v1 --write
 */
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import type { CatalogProductRecord, CatalogStore, ImportedSupplierProduct } from "@entas/catalog";

const args = new Map(process.argv.slice(2).map((argument) => {
  const [key, ...value] = argument.replace(/^--/, "").split("=");
  return [key, value.join("=") || "true"];
}));
const rootDir = path.resolve(import.meta.dirname, "..");
const releaseDir = path.resolve(requiredOption("release"));
const catalogStorePath = path.resolve(args.get("catalog-store") || path.join(rootDir, "data/catalog-store.json"));
const shouldWrite = args.get("write") === "true";

const SOURCE_KEY = "catalog-pdf-karen-led-ayna-2026";
const PROFIT_MULTIPLIER = 1.4;

/**
 * "AYNA FIYAT LISTESI" PDF'inin (KAREN, 2 sayfa) tedarikci ALIS fiyatlari.
 * Bu tablo paketin tek gercek kaynagidir; depodaki fiyat dogrulama icin kullanilir.
 */
const SUPPLIER_PRICES: Record<string, number> = {
  "KRN-AYN-SILVA-60X80XCM": 2000,
  "KRN-AYN-ASTER-50XCM": 850,
  "KRN-AYN-ASTER-60XCM": 1000,
  "KRN-AYN-ASTER-80XCM": 1400,
  "KRN-AYN-AQUA-60X80XCM": 1600,
  "KRN-AYN-ALKA-60X80XCM": 1800,
  "KRN-AYN-TETRA-80X60XCM": 1800,
  "KRN-AYN-HAZE-60X80XCM": 1600,
  "KRN-AYN-SORA-60XCM": 1250,
  "KRN-AYN-SORA-70XCM": 1450,
  "KRN-AYN-SORA-80XCM": 1800,
  "KRN-AYN-SORA-90XCM": 2100,
  "KRN-AYN-VITA-60XCM": 1300,
  "KRN-AYN-VITA-70XCM": 1500,
  "KRN-AYN-VITA-80XCM": 1850,
  "KRN-AYN-VITA-90XCM": 2150,
  "KRN-AYN-MILA-50XCM": 750,
  "KRN-AYN-MILA-60XCM": 900,
  "KRN-AYN-MILA-80XCM": 1300
};

/**
 * Canlidaki gorsel adresleri. Render'da `normalize-product-images` her gorsele
 * `?iv=square-v1` onbellek kirici ekliyor; paket bunu korumazsa canlidaki adres
 * eski haline doner (dosya ayni, yalnizca onbellek davranisi degisir).
 */
const LIVE_IMAGE_SUFFIX = "?iv=square-v1";

async function main(): Promise<void> {
  const store = JSON.parse(await readFile(catalogStorePath, "utf8")) as CatalogStore;
  const matched = store.products.filter((product) => product.sourceKey === SOURCE_KEY);
  if (!matched.length) throw new Error(`Kaynakta urun yok: ${SOURCE_KEY}`);

  const expectedSkus = Object.keys(SUPPLIER_PRICES);
  const missing = expectedSkus.filter((sku) => !matched.some((product) => product.sku === sku));
  if (missing.length) throw new Error(`PDF'te olup depoda olmayan SKU: ${missing.join(", ")}`);

  const unexpected = matched.filter((product) => !(product.sku in SUPPLIER_PRICES));
  if (unexpected.length) {
    throw new Error(`Depoda olup PDF tablosunda olmayan SKU: ${unexpected.map((product) => product.sku).join(", ")}`);
  }

  // `apply-catalog-release.ts` yayin sonrasi TUM paket urunlerinin ACTIVE olmasini
  // sart kosar; pasif urun paketlenirse deploy acilista hata verip durur.
  const inactive = matched.filter((product) => product.status !== "ACTIVE" || !product.isVisible);
  if (inactive.length) throw new Error(`${inactive.length} urun yayinda degil: ${inactive.map((p) => p.sku).join(", ")}`);

  const changes = matched.map((product) => {
    const supplierPrice = SUPPLIER_PRICES[product.sku]!;
    const currentPrice = parseListPrice(product.listPrice);
    const nextPrice = roundMoney(supplierPrice * PROFIT_MULTIPLIER);
    return {
      sku: product.sku,
      name: product.name,
      supplierPrice: supplierPrice.toFixed(2),
      previousPrice: currentPrice.toFixed(2),
      // Eski kural: liste x 0,70. Zarari raporda gorunur tutuyoruz.
      previousDealerPrice: roundMoney(currentPrice * 0.7).toFixed(2),
      nextPrice: nextPrice.toFixed(2),
      nextDealerPrice: nextPrice.toFixed(2),
      currency: product.currency
    };
  });

  const products = matched.map((product) =>
    toImportedProduct(product, roundMoney(SUPPLIER_PRICES[product.sku]! * PROFIT_MULTIPLIER).toFixed(2))
  );

  // Depodaki mevcut fiyat PDF ile ayni olmali (hata tam olarak buydu: PDF alis
  // fiyati liste fiyati sanilmis). Farkliysa ya duzeltme zaten uygulanmis ya da
  // fiyat baska bir yerden degismis; hesabi etkilemez (yeni fiyat PDF'ten gelir)
  // ama sessiz kalmamali.
  const priceDrift = changes
    .filter((change) => change.previousPrice !== change.supplierPrice && change.previousPrice !== change.nextPrice)
    .map((change) => ({ sku: change.sku, storePrice: change.previousPrice, pdfPrice: change.supplierPrice }));
  const alreadyApplied = changes.filter((change) => change.previousPrice === change.nextPrice).length;

  const report = {
    releaseDir: path.relative(rootDir, releaseDir),
    sourceKey: SOURCE_KEY,
    profitMultiplier: PROFIT_MULTIPLIER,
    productCount: products.length,
    alreadyApplied,
    priceDrift,
    changes
  };

  if (!shouldWrite) {
    console.log(JSON.stringify({ mode: "dry-run", ...report }, null, 2));
    return;
  }

  await rm(releaseDir, { recursive: true, force: true });
  // `apply-catalog-release.ts` uploads/ dizinini kosulsuz kopyalar; gorseller
  // zaten diskte oldugu icin tasinacak dosya yok ama dizin var olmalidir.
  await mkdir(path.join(releaseDir, "uploads"), { recursive: true });
  await writeFile(path.join(releaseDir, "uploads/.gitkeep"), "");
  await writeFile(path.join(releaseDir, "products.json"), `${JSON.stringify(products, null, 2)}\n`);
  await writeFile(path.join(releaseDir, "manifest.json"), `${JSON.stringify({
    version: path.basename(releaseDir),
    createdAt: new Date().toISOString(),
    sourceCounts: { [SOURCE_KEY]: products.length },
    productCount: products.length,
    imageCount: 0,
    pricing: {
      basis: "AYNA FIYAT LISTESI PDF (KAREN tedarikci alis listesi)",
      profitMultiplier: PROFIT_MULTIPLIER,
      policy: "Alis fiyati x 1,40 = NET satis fiyati (KDV dahil). Marka iskontosu uygulanmaz.",
      requires: "commercial-policy.ts icinde SOURCE_PRICE_POLICIES[catalog-pdf-karen-led-ayna-2026] = net",
      changes
    }
  }, null, 2)}\n`);
  console.log(JSON.stringify({ mode: "write", ...report }, null, 2));
}

/**
 * Urun metnini yeni fiyat kuralina gore duzeltir. Eski metin "Liste fiyatina
 * KAREN marka %30 iskonto uygulanir" diyordu; bu artik yanlis ve bayiyi
 * yaniltir, cunku gosterilen fiyat dogrudan net satis fiyatidir.
 */
function rewriteDescription(description: string | undefined): string | undefined {
  if (!description) return description;
  return description.replace(
    /Liste fiyatına KAREN marka %30 iskonto uygulanır; gösterilen satış fiyatı KDV dahildir\./g,
    "Gösterilen fiyat net satış fiyatıdır; ayrıca iskonto uygulanmaz, KDV dahildir."
  );
}

/** "İskonto: %30" spec satirini kaldirir, "Fiyat: Net" satirini ekler. */
function rewriteSpecs(
  specs: Array<{ label: string; value: string }> | undefined
): Array<{ label: string; value: string }> | undefined {
  if (!specs) return specs;
  const withoutDiscount = specs.filter((spec) => spec.label !== "İskonto");
  const kdvIndex = withoutDiscount.findIndex((spec) => spec.label === "KDV");
  const priceSpec = { label: "Fiyat", value: "Net (iskonto uygulanmaz)" };
  if (kdvIndex < 0) return [...withoutDiscount, priceSpec];
  return [...withoutDiscount.slice(0, kdvIndex), priceSpec, ...withoutDiscount.slice(kdvIndex)];
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Depoda fiyat "1690.0000" ya da "1.690,00" bicimlerinde olabilir. */
function parseListPrice(value: string): number {
  const raw = (value ?? "").trim().replace(/\s/g, "");
  const normalized = raw.includes(",") ? raw.replace(/\./g, "").replace(",", ".") : raw;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

function toImportedProduct(product: CatalogProductRecord, listPrice: string): ImportedSupplierProduct {
  const imageUrl = product.imageUrl?.startsWith("/uploads/") && !product.imageUrl.includes("?")
    ? `${product.imageUrl}${LIVE_IMAGE_SUFFIX}`
    : product.imageUrl;

  return stripUndefined({
    sourceKey: product.sourceKey,
    sourceName: product.sourceName,
    externalId: product.externalId,
    sku: product.sku,
    barcode: product.barcode,
    manufacturerCode: product.manufacturerCode,
    productName: product.name,
    brandName: product.brand,
    categoryPath: product.categoryPath,
    categoryName: product.category,
    unitType: product.unitType,
    taxRate: product.taxRate,
    currency: product.currency,
    listPrice,
    stockQuantity: product.stockQuantity,
    stockStatus: product.stockStatus,
    stockQuantityKnown: product.stockQuantityKnown,
    description: rewriteDescription(product.description),
    technicalSpecs: rewriteSpecs(product.technicalSpecs),
    minOrder: product.minOrder,
    packageQuantity: product.packageQuantity,
    cartonQuantity: product.cartonQuantity,
    palletQuantity: product.palletQuantity,
    warrantyMonths: product.warrantyMonths,
    imageUrl,
    sourceUrl: product.sourceUrl,
    priceVisibleToPublic: false
  }) as ImportedSupplierProduct;
}

function stripUndefined<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined)) as T;
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
