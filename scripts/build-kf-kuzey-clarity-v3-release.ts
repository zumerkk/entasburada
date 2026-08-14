import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import type { ImportedSupplierProduct } from "@entas/catalog";
import {
  createEntasCatalogProductImage,
  ENTAS_CATALOG_IMAGE_CANVAS_SIZE,
  readProductImageMetadata
} from "../apps/web/lib/product-image-normalizer";

type ElbowDefinition = {
  externalId: string;
  manufacturerCode: string;
  size: string;
};

const rootDir = path.resolve(import.meta.dirname, "..");
const releaseVersion = "2026-08-14-kf-kuzey-fittings-quality-v3";
const sourceReleaseDir = path.join(rootDir, "deploy", "catalog-releases", "2026-08-14-kf-kuzey-fittings-quality-v2");
const releaseDir = path.join(rootDir, "deploy", "catalog-releases", releaseVersion);
const restoredSourcePath = path.join(
  rootDir,
  "scripts",
  "catalog-data",
  "kf-kuzey-clarity-v3",
  "galvaniz-dirsek-restored.png"
);
const uploadSubdir = path.join("catalog-imports", "kf-kuzey-fittings-2026-quality-v3", "products");
const uploadDir = path.join(releaseDir, "uploads", uploadSubdir);
const officialPdfUrl = "https://kuzeyfittings.com.tr/wp-content/uploads/2026/06/2026-Katalog.pdf";
const imageReferenceUrl = "https://www.iconinsaatyapi.com.tr/kuzey-1-1/4-galvaniz-dirsek";
const shouldWrite = process.argv.includes("--write");

const elbowDefinitions: ElbowDefinition[] = [
  { externalId: "p004-kf001", manufacturerCode: "KF001", size: "1/2\"" },
  { externalId: "p004-kf002", manufacturerCode: "KF002", size: "3/4\"" },
  { externalId: "p004-kf003", manufacturerCode: "KF003", size: "1\"" },
  { externalId: "p004-kf004", manufacturerCode: "KF004", size: "1 1/4\"" },
  { externalId: "p004-kf005", manufacturerCode: "KF005", size: "1 1/2\"" },
  { externalId: "p004-kf006", manufacturerCode: "KF006", size: "2\"" },
  { externalId: "p004-kf007", manufacturerCode: "KF007", size: "2 1/2\"" },
  { externalId: "p004-kf008", manufacturerCode: "KF008", size: "3\"" },
  { externalId: "p004-kf009", manufacturerCode: "KF009", size: "4\"" }
];

async function main(): Promise<void> {
  const sourceProducts = JSON.parse(
    await readFile(path.join(sourceReleaseDir, "products.json"), "utf8")
  ) as ImportedSupplierProduct[];
  const sourceByExternalId = new Map(sourceProducts.map((product) => [product.externalId, product]));
  const sourceImage = await readFile(restoredSourcePath);
  const sourceMetadata = await readProductImageMetadata(sourceImage);
  if (sourceMetadata.width < 1000 || sourceMetadata.height < 1000) {
    throw new Error(`Onarılmış KF görseli beklenen çözünürlükte değil: ${sourceMetadata.width}x${sourceMetadata.height}`);
  }

  const products = elbowDefinitions.map((definition) => {
    const source = sourceByExternalId.get(definition.externalId);
    if (!source) throw new Error(`V2 sürümünde ürün bulunamadı: ${definition.externalId}`);
    if (source.manufacturerCode !== definition.manufacturerCode) {
      throw new Error(`Ürün kodu uyuşmuyor: ${definition.externalId}`);
    }
    return buildProduct(source, definition);
  });

  const report = {
    releaseVersion,
    productCount: products.length,
    correctedProductNameCount: products.filter((product, index) => product.productName !== sourceByExternalId.get(elbowDefinitions[index]!.externalId)!.productName).length,
    sourceImage: `${sourceMetadata.width}x${sourceMetadata.height}`,
    normalizedCanvas: `${ENTAS_CATALOG_IMAGE_CANVAS_SIZE}x${ENTAS_CATALOG_IMAGE_CANVAS_SIZE} WebP`,
    mode: shouldWrite ? "write" : "dry-run"
  };
  if (!shouldWrite) {
    console.log(JSON.stringify({ ...report, products }, null, 2));
    return;
  }

  await rm(releaseDir, { recursive: true, force: true });
  await mkdir(uploadDir, { recursive: true });
  const normalized = await createEntasCatalogProductImage(sourceImage);
  const imageFilename = "kf-galvaniz-dirsek-netlik-v3.webp";
  await writeFile(path.join(uploadDir, imageFilename), normalized.buffer);
  const imageUrl = `/uploads/${uploadSubdir.split(path.sep).join("/")}/${imageFilename}`;
  for (const product of products) product.imageUrl = imageUrl;

  await writeFile(path.join(releaseDir, "products.json"), `${JSON.stringify(products, null, 2)}\n`);
  await writeFile(path.join(releaseDir, "manifest.json"), `${JSON.stringify({
    ...report,
    createdAt: new Date().toISOString(),
    source: {
      productData: "KF Kuzey Fittings 2026/1 resmî fiyat kataloğu",
      officialPdf: officialPdfUrl,
      productPhotoVerification: imageReferenceUrl,
      restoredImageSha256: createHash("sha256").update(sourceImage).digest("hex")
    },
    imagePolicy: "Resmî PDF'deki yaklaşık 60 piksellik bulanık dirsek görseli kullanılmadı. KF markalı gerçek ürün fotoğrafı geometri, bağlantı ağzı, diş yapısı ve ürün formu korunarak netlik restorasyonundan geçirildi; oran korumalı 2160px ENTAŞBURADA çerçevesi ve watermark uygulandı.",
    productPolicy: "KF001-KF009 kodlarının ölçüleri katalog sırasına göre doğrulandı; ürün adlarına ölçü eklendi. Ölçü varyantları aynı galvaniz dirsek ürün ailesi temsil görselini kullanır.",
    sourceImageWidth: normalized.sourceWidth,
    sourceImageHeight: normalized.sourceHeight,
    outputImageWidth: normalized.width,
    outputImageHeight: normalized.height,
    uniqueImageCount: 1
  }, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
}

function buildProduct(source: ImportedSupplierProduct, definition: ElbowDefinition): ImportedSupplierProduct {
  const productName = `${definition.size} Galvaniz Dirsek - ${definition.manufacturerCode}`;
  const technicalSpecs = (source.technicalSpecs || [])
    .filter((spec) => !["Ölçü", "Görsel Kalitesi", "Katalog Satırı"].includes(spec.label));
  technicalSpecs.splice(2, 0, { label: "Ölçü", value: definition.size });
  technicalSpecs.push({
    label: "Görsel Kalitesi",
    value: "Netlik restorasyonlu gerçek KF ürün fotoğrafı; oran korumalı 2160px ENTAŞ sunum standardı"
  });

  return {
    ...source,
    sourceName: "KF Kuzey Fittings 2026/1 Fiyat Kataloğu - Netlik V3",
    productName,
    description: `${productName}. KF Kuzey Fittings 2026/1 resmî kataloğunun 4. sayfasındaki ${definition.manufacturerCode} kodlu ${definition.size} ölçü varyantıdır. Görsel, düşük çözünürlüklü PDF küçük resmi yerine KF markalı gerçek ürün fotoğrafından netlik restorasyonu ile hazırlanmıştır. Gerçek stok ve teslim süresi sipariş öncesinde teyit edilmelidir.`,
    technicalSpecs,
    imageUrl: "",
    sourceUrl: `${officialPdfUrl}#page=4`
  };
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
