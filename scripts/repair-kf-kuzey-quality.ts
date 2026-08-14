import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  extractCatalogPageWithAi,
  type CatalogPageExtraction
} from "../apps/web/lib/catalog-ai-extractor";
import {
  extractEmbeddedPdfImages,
  extractPdfPageText,
  renderPdfPage
} from "../apps/web/lib/pdf-catalog-tools";

type SeedProduct = {
  page: number;
  manufacturerCode: string;
  name: string;
  categoryPath: string[];
};

type PageAudit = {
  page: number;
  seedProductCount: number;
  embeddedImageCount: number;
  extraction: CatalogPageExtraction;
};

const rootDir = path.resolve(import.meta.dirname, "..");
const sourcePdf = process.env.KF_CATALOG_PDF || "/Users/zumerkekillioglu/Downloads/2026 Katalog.pdf";
const seedPath = path.join(rootDir, "scripts", "catalog-data", "kf-kuzey-2026.json");
const auditDir = path.join(rootDir, "tmp", "pdfs", "kf-kuzey-quality", "ai-pages");
const jobId = "kf-kuzey-quality-v2";

async function main(): Promise<void> {
  const seeds = JSON.parse(await readFile(seedPath, "utf8")) as SeedProduct[];
  const requestedPage = numberArgument("--page");
  const concurrency = Math.min(3, numberArgument("--concurrency") || 2);
  const force = process.argv.includes("--force");
  const pages = requestedPage
    ? [requestedPage]
    : [...new Set(seeds.map((seed) => seed.page))].sort((left, right) => left - right);

  process.env.CATALOG_AI_PROVIDER ||= "gemini";
  process.env.CATALOG_COMPLETENESS_AUDIT ||= "false";
  await mkdir(auditDir, { recursive: true });

  await mapWithConcurrency(pages, concurrency, async (page) => {
    const pageSeeds = seeds.filter((seed) => seed.page === page);
    const outputPath = path.join(auditDir, `page-${String(page).padStart(3, "0")}.json`);
    if (!force && await fileExists(outputPath)) {
      console.log(JSON.stringify({ page, status: "cached", outputPath }));
      return;
    }
    const rendered = await renderPdfPage(jobId, sourcePdf, page);
    const [pageText, embeddedImages] = await Promise.all([
      extractPdfPageText(sourcePdf, page),
      extractEmbeddedPdfImages(jobId, sourcePdf, page)
    ]);
    const extraction = await extractCatalogPageWithAi({
      imageBase64: rendered.imageBase64,
      coordinateImageBase64: rendered.coordinateImageBase64,
      pageText,
      hints: {
        fileName: path.basename(sourcePdf),
        pageNumber: page,
        pageCount: 130,
        sourceName: "KF Kuzey Fittings 2026/1 resmi kataloğu",
        brandHint: "KF Kuzey Fittings",
        categoryHint: pageSeeds[0]?.categoryPath.at(-1) || "Tesisat ve banyo ürünleri",
        defaultCurrency: page === 33 ? "USD" : "TRY",
        imageCandidates: embeddedImages.map((image) => ({ index: image.index, region: image.region })),
        ocrModelCandidates: pageSeeds.map((seed) => seed.manufacturerCode)
      }
    });
    const audit: PageAudit = {
      page,
      seedProductCount: pageSeeds.length,
      embeddedImageCount: embeddedImages.length,
      extraction
    };
    await writeFile(outputPath, `${JSON.stringify(audit, null, 2)}\n`);
    console.log(JSON.stringify({
      page,
      seeds: pageSeeds.length,
      aiProducts: extraction.products.length,
      embeddedImages: embeddedImages.length,
      provider: extraction.provider,
      outputPath
    }));
  });
}

function numberArgument(name: string): number | null {
  const prefix = `${name}=`;
  const raw = process.argv.find((argument) => argument.startsWith(prefix))?.slice(prefix.length);
  const value = Number(raw);
  return Number.isInteger(value) && value > 0 ? value : null;
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await readFile(filePath);
    return true;
  } catch {
    return false;
  }
}

async function mapWithConcurrency<T>(items: T[], concurrency: number, mapper: (item: T) => Promise<void>): Promise<void> {
  let nextIndex = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    for (;;) {
      const index = nextIndex++;
      if (index >= items.length) return;
      await mapper(items[index]!);
    }
  });
  await Promise.all(workers);
}

void main();
