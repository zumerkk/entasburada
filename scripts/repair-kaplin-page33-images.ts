import { execFile as execFileCallback } from "node:child_process";
import { mkdtemp, readFile, rename, rm, writeFile, mkdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { cropAndNormalizeProductImage, readProductImageMetadata } from "../apps/web/lib/product-image-normalizer";

interface Product {
  id: string;
  sku: string;
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
const referenceCrop = { x: 355, y: 60, width: 170, height: 205 };

async function main(): Promise<void> {
  const jobs = JSON.parse(await readFile(jobsPath, "utf8")) as Job[];
  const job = jobs.find((candidate) => candidate.id === jobId);
  if (!job) throw new Error(`Import job bulunamadı: ${jobId}`);
  if (["queued", "processing"].includes(job.status)) throw new Error("PDF işleme tamamlanmadan görsel onarımı yapılamaz.");
  const products = job.extractedProducts.filter((product) => product.sourcePage === 33 && !product.sku.startsWith("KATALOG"));
  if (products.length !== 30) throw new Error(`33. sayfada 30 yerine ${products.length} ürün bulundu.`);
  const invalidCodes = products.filter((product) => !/^EXDRP8[3-8]\d{6}$/.test(product.sku)).map((product) => product.sku);
  if (invalidCodes.length) throw new Error(`Beklenmeyen 33. sayfa kodları: ${invalidCodes.join(", ")}`);

  const report = { jobId, page: 33, products: products.length, sharedFamilyImage: true };
  if (!shouldWrite) {
    console.log(JSON.stringify({ mode: "dry-run", ...report }, null, 2));
    return;
  }

  const temporaryDir = await mkdtemp(path.join(os.tmpdir(), "kaplin-page33-"));
  try {
    const renderPrefix = path.join(temporaryDir, "page33");
    await execFile("pdftoppm", ["-f", "33", "-l", "33", "-singlefile", "-png", "-r", "220", pdfPath, renderPrefix], {
      timeout: 120_000,
      maxBuffer: 8 * 1024 * 1024
    });
    const renderedPath = `${renderPrefix}.png`;
    const metadata = await readProductImageMetadata(renderedPath);
    const crop = scaleCrop(metadata.width, metadata.height);
    const normalized = await cropAndNormalizeProductImage(renderedPath, crop);
    const outputDir = path.join(rootDir, "apps/web/public/uploads/catalog-imports", jobId, "products");
    const fileName = "repair-p0033-damla-sulama-borusu.webp";
    const imageUrl = `/uploads/catalog-imports/${jobId}/products/${fileName}`;
    await mkdir(outputDir, { recursive: true });
    await writeFile(path.join(outputDir, fileName), normalized.buffer);

    for (const product of products) {
      product.imageUrl = imageUrl;
      product.extractionWarnings = uniqueStrings([
        "Ürün görseli PDF sayfa 33 üzerindeki gerçek damla sulama borusu rulosundan kırpılıp 1200x1200 WebP standardına getirildi.",
        ...(product.extractionWarnings ?? [])
      ]);
    }
    job.updatedAt = new Date().toISOString();
    job.notes = uniqueStrings([
      "KAPLİN sayfa 33: tablo şeridi görselleri kaldırıldı; 30 varyant doğru damla sulama borusu aile görseline bağlandı.",
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

function scaleCrop(width: number, height: number): { left: number; top: number; width: number; height: number } {
  const scaleX = width / referenceWidth;
  const scaleY = height / referenceHeight;
  const left = Math.round(referenceCrop.x * scaleX);
  const top = Math.round(referenceCrop.y * scaleY);
  return {
    left,
    top,
    width: Math.min(width - left, Math.round(referenceCrop.width * scaleX)),
    height: Math.min(height - top, Math.round(referenceCrop.height * scaleY))
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
