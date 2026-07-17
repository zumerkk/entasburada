import { execFile as execFileCallback } from "node:child_process";
import { mkdtemp, readFile, rename, rm, writeFile, mkdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { cropAndNormalizeProductImage, readProductImageMetadata } from "../apps/web/lib/product-image-normalizer";

interface Product {
  id: string;
  sku: string;
  productName: string;
  sourcePage?: number;
  imageUrl?: string;
  extractionWarnings?: string[];
}

interface Job {
  id: string;
  status: string;
  updatedAt: string;
  extractedProducts: Product[];
  notes: string[];
}

interface CropDefinition {
  key: string;
  patterns: string[];
  x: number;
  y: number;
  width: number;
  height: number;
}

const execFile = promisify(execFileCallback);
const args = new Map(process.argv.slice(2).map((argument) => {
  const [key, ...value] = argument.replace(/^--/, "").split("=");
  return [key, value.join("=") || "true"];
}));
const rootDir = path.resolve(import.meta.dirname, "..");
const jobId = requiredOption("job-id");
const pdfPath = path.resolve(requiredOption("pdf"));
const jobsPath = path.resolve(args.get("jobs") || path.join(rootDir, "data/ai-import-jobs.json"));
const shouldWrite = args.get("write") === "true";
const referenceWidth = 1819;
const referenceHeight = 1293;

const crops: CropDefinition[] = [
  { key: "kurtagzi-ekleme-nipeli", patterns: ["kurtağzı ekleme nipeli"], x: 80, y: 125, width: 235, height: 70 },
  { key: "kurtagzi-conta-cikis-nipeli", patterns: ["kurtağzı conta çıkış nipeli"], x: 80, y: 275, width: 230, height: 70 },
  { key: "kurtagzi-reduksiyon-nipeli", patterns: ["kurtağzı redüksiyon nipeli"], x: 80, y: 420, width: 225, height: 65 },
  { key: "kurtagzi-kor-tapa", patterns: ["kurtağzı kör tapa"], x: 80, y: 540, width: 175, height: 90 },
  { key: "gozluk-tapa", patterns: ["gözlük tapa"], x: 80, y: 705, width: 180, height: 85 },
  { key: "kurtagzi-te", patterns: ["kurtağzı te"], x: 80, y: 850, width: 225, height: 95 },
  { key: "kurtagzi-dirsek", patterns: ["kurtağzı dirsek"], x: 80, y: 1020, width: 225, height: 95 },
  { key: "sabitleme-kazigi", patterns: ["sabitleme kazığı"], x: 80, y: 1170, width: 235, height: 70 },
  { key: "somunlu-ekleme-nipeli", patterns: ["somunlu ekleme nipeli"], x: 970, y: 125, width: 200, height: 70 },
  { key: "somunlu-dis-disli-ekleme-nipeli", patterns: ["somunlu dış dişli ekleme nipeli"], x: 970, y: 300, width: 210, height: 90 },
  { key: "somunlu-conta-cikis-nipeli", patterns: ["somunlu conta çıkış nipeli"], x: 970, y: 480, width: 200, height: 70 },
  { key: "somunlu-kurtagzi-ekleme-nipeli", patterns: ["somunlu kurtağzı ekleme nipeli"], x: 970, y: 655, width: 205, height: 85 },
  { key: "somunlu-contasiz-cikis-nipeli", patterns: ["somunlu contasız çıkış nipeli"], x: 970, y: 835, width: 200, height: 90 },
  { key: "yuzuklu-conta-cikis-nipeli", patterns: ["yüzüklü conta çıkış nipeli"], x: 970, y: 1005, width: 205, height: 75 },
  { key: "yuzuklu-ekleme-nipeli", patterns: ["yüzüklü ekleme nipeli"], x: 970, y: 1160, width: 205, height: 80 }
];

async function main(): Promise<void> {
  const jobs = JSON.parse(await readFile(jobsPath, "utf8")) as Job[];
  const job = jobs.find((candidate) => candidate.id === jobId);
  if (!job) throw new Error(`Import job bulunamadı: ${jobId}`);
  if (["queued", "processing"].includes(job.status)) throw new Error("PDF işleme tamamlanmadan görsel onarımı yapılamaz.");
  const products = job.extractedProducts.filter((product) => product.sourcePage === 36);
  if (products.length !== 42) throw new Error(`36. sayfada 42 yerine ${products.length} ürün bulundu.`);

  const mapped = products.map((product) => ({ product, crop: findCrop(product.productName) }));
  const unmapped = mapped.filter((item) => !item.crop).map((item) => `${item.product.sku}: ${item.product.productName}`);
  if (unmapped.length) throw new Error(`Görsel ailesi eşleşmeyen ürünler:\n${unmapped.join("\n")}`);

  const report = {
    jobId,
    page: 36,
    products: products.length,
    families: [...new Set(mapped.map((item) => item.crop!.key))],
    mappedProducts: mapped.length
  };
  if (!shouldWrite) {
    console.log(JSON.stringify({ mode: "dry-run", ...report }, null, 2));
    return;
  }

  const temporaryDir = await mkdtemp(path.join(os.tmpdir(), "kaplin-page36-"));
  try {
    const renderPrefix = path.join(temporaryDir, "page36");
    await execFile("pdftoppm", ["-f", "36", "-l", "36", "-singlefile", "-png", "-r", "220", pdfPath, renderPrefix], {
      timeout: 120_000,
      maxBuffer: 8 * 1024 * 1024
    });
    const renderedPath = `${renderPrefix}.png`;
    const metadata = await readProductImageMetadata(renderedPath);
    const outputDir = path.join(rootDir, "apps/web/public/uploads/catalog-imports", jobId, "products");
    await mkdir(outputDir, { recursive: true });
    const urlByFamily = new Map<string, string>();

    for (const crop of crops) {
      if (!mapped.some((item) => item.crop?.key === crop.key)) continue;
      const region = scaleCrop(crop, metadata.width, metadata.height);
      const normalized = await cropAndNormalizeProductImage(renderedPath, region);
      const fileName = `repair-p0036-${crop.key}.webp`;
      await writeFile(path.join(outputDir, fileName), normalized.buffer);
      urlByFamily.set(crop.key, `/uploads/catalog-imports/${jobId}/products/${fileName}`);
    }

    for (const { product, crop } of mapped) {
      product.imageUrl = urlByFamily.get(crop!.key)!;
      product.extractionWarnings = uniqueStrings([
        "Ürün görseli PDF sayfa 36 üzerindeki doğru ürün ailesinden kırpılıp 1200x1200 WebP standardına getirildi.",
        ...(product.extractionWarnings ?? [])
      ]);
    }
    job.updatedAt = new Date().toISOString();
    job.notes = uniqueStrings([
      "KAPLİN sayfa 36: 15 ürün ailesi görseli tablo ve teknik çizimlerden ayrılarak 42 varyanta eşlendi.",
      ...job.notes
    ]).slice(0, 100);
    const temporaryJobsPath = `${jobsPath}.${process.pid}.${Date.now()}.tmp`;
    await writeFile(temporaryJobsPath, `${JSON.stringify(jobs, null, 2)}\n`);
    await rename(temporaryJobsPath, jobsPath);
  } finally {
    await rm(temporaryDir, { recursive: true, force: true });
  }
  console.log(JSON.stringify({ mode: "write", ...report }, null, 2));
}

function findCrop(productName: string): CropDefinition | undefined {
  const normalized = productName.toLocaleLowerCase("tr-TR");
  return crops.find((crop) => crop.patterns.some((pattern) => normalized.startsWith(pattern)));
}

function scaleCrop(crop: CropDefinition, width: number, height: number): { left: number; top: number; width: number; height: number } {
  const scaleX = width / referenceWidth;
  const scaleY = height / referenceHeight;
  const left = Math.max(0, Math.round(crop.x * scaleX));
  const top = Math.max(0, Math.round(crop.y * scaleY));
  return {
    left,
    top,
    width: Math.min(width - left, Math.max(1, Math.round(crop.width * scaleX))),
    height: Math.min(height - top, Math.max(1, Math.round(crop.height * scaleY)))
  };
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
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
