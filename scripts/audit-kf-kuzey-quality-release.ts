import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import type { ImportedSupplierProduct } from "@entas/catalog";
import {
  ENTAS_CATALOG_IMAGE_CANVAS_SIZE,
  readProductImageMetadata
} from "../apps/web/lib/product-image-normalizer";

const rootDir = path.resolve(import.meta.dirname, "..");
const releaseDir = path.join(rootDir, "deploy", "catalog-releases", "2026-08-14-kf-kuzey-fittings-quality-v2");

async function main(): Promise<void> {
  const products = JSON.parse(await readFile(path.join(releaseDir, "products.json"), "utf8")) as ImportedSupplierProduct[];
  const manifest = JSON.parse(await readFile(path.join(releaseDir, "manifest.json"), "utf8")) as {
    productCount: number;
    uniqueImageCount: number;
  };
  if (products.length !== manifest.productCount) throw new Error(`Ürün sayısı manifest ile farklı: ${products.length}/${manifest.productCount}`);
  if (new Set(products.map((product) => product.externalId)).size !== products.length) throw new Error("Tekrarlanan externalId bulundu");
  if (products.some((product) => !product.productName || !product.manufacturerCode || !product.imageUrl)) throw new Error("Zorunlu ürün alanı eksik");
  if (products.some((product) => product.imageUrl.includes("kf-kuzey-fittings-2026-1/products"))) throw new Error("Eski kalite V1 görsel yolu kaldı");

  const imageUrls = [...new Set(products.map((product) => product.imageUrl))];
  if (imageUrls.length !== manifest.uniqueImageCount) throw new Error(`Benzersiz görsel sayısı manifest ile farklı: ${imageUrls.length}/${manifest.uniqueImageCount}`);
  const imageStats = await mapWithConcurrency(imageUrls, 12, async (imageUrl) => {
    const relative = imageUrl.replace(/^\/uploads\//, "");
    const filePath = path.join(releaseDir, "uploads", relative);
    const [metadata, file] = await Promise.all([readProductImageMetadata(filePath), stat(filePath)]);
    if (metadata.width !== ENTAS_CATALOG_IMAGE_CANVAS_SIZE || metadata.height !== ENTAS_CATALOG_IMAGE_CANVAS_SIZE) {
      throw new Error(`Görsel çözünürlüğü hatalı: ${imageUrl} ${metadata.width}x${metadata.height}`);
    }
    if (file.size < 6_000) throw new Error(`Görsel dosyası şüpheli derecede küçük: ${imageUrl} ${file.size}`);
    return file.size;
  });

  assertProduct(products, "KF001", "Galvaniz Dirsek", "p004-p4-candidate-0");
  assertProduct(products, "KB301-1", "Siyah Mix Banyo Bataryası", "p007-p7-candidate-1");
  assertProduct(products, "KB303", "Mix Kuğu Lavabo Bataryası", "p007-p7-candidate-2");
  assertProduct(products, "KP001", "Plastik Küresel Vana", "p114-p114-candidate-1");
  assertProduct(products, "S1651", "NORMAL HORTUM EKLERİ", "p114-p114-candidate-7");
  assertProduct(products, "21311", "Kaplin Erkek", "p116-p116-candidate-0");
  assertProduct(products, "148311", "Çift Çıkışlı Priz Kolye", "p124-p124-candidate-0");

  console.log(JSON.stringify({
    products: products.length,
    images: imageUrls.length,
    resolution: `${ENTAS_CATALOG_IMAGE_CANVAS_SIZE}x${ENTAS_CATALOG_IMAGE_CANVAS_SIZE}`,
    minimumImageBytes: Math.min(...imageStats),
    maximumImageBytes: Math.max(...imageStats),
    totalImageBytes: imageStats.reduce((sum, value) => sum + value, 0),
    regressions: 7,
    status: "passed"
  }, null, 2));
}

function assertProduct(products: ImportedSupplierProduct[], code: string, name: string, imagePath: string): void {
  const product = products.find((entry) => entry.manufacturerCode === code);
  if (!product) throw new Error(`Regresyon ürünü bulunamadı: ${code}`);
  if (!product.productName.includes(name)) throw new Error(`Regresyon ürün adı hatalı: ${code} -> ${product.productName}`);
  if (!product.imageUrl.includes(imagePath)) throw new Error(`Regresyon görseli hatalı: ${code} -> ${product.imageUrl}`);
}

async function mapWithConcurrency<T, R>(items: T[], concurrency: number, mapper: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let nextIndex = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    for (;;) {
      const index = nextIndex++;
      if (index >= items.length) return;
      results[index] = await mapper(items[index]!);
    }
  });
  await Promise.all(workers);
  return results;
}

void main();
