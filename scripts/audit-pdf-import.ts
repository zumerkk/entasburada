import { execFile as execFileCallback } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { readProductImageContentBounds, readProductImageMetadata } from "../apps/web/lib/product-image-normalizer";

interface ImportProduct {
  sku?: string;
  manufacturerCode?: string;
  listPrice?: string;
  currency?: string;
  imageUrl?: string;
  excluded?: boolean;
  manuallyReviewed?: boolean;
}

interface ImportJob {
  id: string;
  sourceName: string;
  status: string;
  extractedProducts: ImportProduct[];
  pdfProgress?: { failedPages: number; failedPageNumbers: number[] };
}

const execFile = promisify(execFileCallback);
const args = new Map(
  process.argv.slice(2).map((argument) => {
    const [key, ...value] = argument.replace(/^--/, "").split("=");
    return [key, value.join("=") || "true"];
  })
);
const rootDir = path.resolve(import.meta.dirname, "..");
const jobId = requiredOption("job-id");
const pdfPath = path.resolve(requiredOption("pdf"));
const startPage = positiveInteger(requiredOption("start-page"));
const endPage = positiveInteger(requiredOption("end-page"));
const jobsPath = path.resolve(args.get("jobs") || path.join(rootDir, "data/ai-import-jobs.json"));
const reportPath = args.get("report") ? path.resolve(args.get("report")!) : null;
const allowedPrefixes = (args.get("prefixes") || "").split(",").map((value) => value.trim().toUpperCase()).filter(Boolean);
const includeNumericCodes = args.get("include-numeric") === "true";
const numericPages = new Set((args.get("numeric-pages") || "").split(",").map((value) => Number(value.trim())).filter(Number.isInteger));

async function main(): Promise<void> {
  if (endPage < startPage) throw new Error("Bitiş sayfası başlangıç sayfasından küçük olamaz.");
  const jobs = JSON.parse(await readFile(jobsPath, "utf8")) as ImportJob[];
  const job = jobs.find((candidate) => candidate.id === jobId);
  if (!job) throw new Error(`Import job bulunamadı: ${jobId}`);

  const expectedEntries = await extractCommercialEntries();
  const expectedCodes = [...expectedEntries.keys()];
  const products = job.extractedProducts.filter((product) => !product.excluded);
  const actualSkus = products.map((product) => clean(product.sku)).filter(Boolean);
  const actualSkuSet = new Set(actualSkus);
  const expectedSet = new Set(expectedCodes);
  const missingCodes = expectedCodes.filter((code) => !actualSkuSet.has(code));
  const extraCodes = [...actualSkuSet].filter((code) => !expectedSet.has(code));
  const duplicateSkus = [...new Set(actualSkus.filter((sku, index) => actualSkus.indexOf(sku) !== index))].sort();
  const catalogBlankPriceCodes = expectedCodes.filter((code) => expectedEntries.get(code)?.price === null);
  const importedBlankPriceCodes = products.filter((product) => !(Number(product.listPrice) > 0)).map((product) => clean(product.sku)).sort();
  const unexpectedBlankPriceCodes = importedBlankPriceCodes.filter((code) => expectedEntries.get(code)?.price !== null);
  const unexpectedPricedCodes = catalogBlankPriceCodes.filter((code) => {
    const product = products.find((candidate) => clean(candidate.sku) === code);
    return product ? Number(product.listPrice) > 0 : false;
  });
  const priceMismatches = products.flatMap((product) => {
    const sku = clean(product.sku);
    const expected = expectedEntries.get(sku);
    if (!expected?.price) return [];
    const actualPrice = Number(product.listPrice);
    const actualCurrency = clean(product.currency).toUpperCase();
    if (Math.abs(actualPrice - Number(expected.price)) < 0.005 && actualCurrency === expected.currency) return [];
    return [{ sku, expectedPrice: expected.price, actualPrice: product.listPrice ?? "", expectedCurrency: expected.currency, actualCurrency }];
  });
  const productsWithoutPrice = importedBlankPriceCodes.length;
  const productsWithoutImage = products.filter((product) => !clean(product.imageUrl)).length;
  const productsWithoutReview = products.filter((product) => !product.manuallyReviewed).map((product) => clean(product.sku));
  const imageUrls = [...new Set(products.map((product) => clean(product.imageUrl)).filter((url) => url.startsWith("/uploads/")))];
  const imageFailures = await auditImages(imageUrls);
  const failedPages = job.pdfProgress?.failedPages ?? 0;
  const ok = missingCodes.length === 0 && extraCodes.length === 0 && duplicateSkus.length === 0 &&
    unexpectedBlankPriceCodes.length === 0 && unexpectedPricedCodes.length === 0 && priceMismatches.length === 0 &&
    productsWithoutImage === 0 && productsWithoutReview.length === 0 && imageFailures.length === 0 && failedPages === 0;
  const report = {
    ok,
    jobId,
    sourceName: job.sourceName,
    status: job.status,
    pages: `${startPage}-${endPage}`,
    expectedUniqueCodes: expectedCodes.length,
    importedProducts: products.length,
    importedUniqueSkus: actualSkuSet.size,
    productsWithoutPrice,
    catalogBlankPriceCodes,
    unexpectedBlankPriceCodes,
    unexpectedPricedCodes,
    priceMismatches,
    productsWithoutImage,
    productsWithoutReview,
    uniqueLocalImages: imageUrls.length,
    failedPages,
    failedPageNumbers: job.pdfProgress?.failedPageNumbers ?? [],
    missingCodes,
    extraCodes,
    duplicateSkus,
    imageFailures
  };
  if (reportPath) await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
  if (!ok) process.exitCode = 1;
}

async function extractCommercialEntries(): Promise<Map<string, { page: number; price: string | null; currency: string }>> {
  const entries = new Map<string, { page: number; price: string | null; currency: string }>();
  for (let page = startPage; page <= endPage; page += 1) {
    const { stdout } = await execFile("pdftotext", [
      "-f", String(page), "-l", String(page), "-layout", "-enc", "UTF-8", pdfPath, "-"
    ], { encoding: "utf8", maxBuffer: 8 * 1024 * 1024, timeout: 30_000 });
    const lines = stdout.split(/\r?\n/);
    for (const line of lines) {
      const normalized = normalizeLine(line);
      const matches = findCodeMatches(normalized, page);
      for (let index = 0; index < matches.length; index += 1) {
        const match = matches[index]!;
        const segment = normalized.slice(match.end, matches[index + 1]?.start ?? normalized.length);
        const money = segment.match(/(\d{1,3}(?:\.\d{3})*|\d+)(?:,(\d{2}))?\s*([₺€$])/);
        const parsed = money ? {
          price: `${money[1]!.replace(/\./g, "")}.${money[2] ?? "00"}`,
          currency: currencyForSymbol(money[3]!)
        } : { price: null, currency: "TRY" };
        const existing = entries.get(match.code);
        if (existing?.price && parsed.price && (existing.price !== parsed.price || existing.currency !== parsed.currency)) {
          throw new Error(`${match.code} için PDF içinde çelişkili fiyat bulundu: ${existing.price} / ${parsed.price}`);
        }
        if (!existing || (!existing.price && parsed.price)) entries.set(match.code, { page, ...parsed });
      }
    }
    assignWrappedPrices(lines, page, entries);
  }
  return entries;
}

function assignWrappedPrices(
  lines: string[],
  page: number,
  entries: Map<string, { page: number; price: string | null; currency: string }>
): void {
  for (let index = 0; index < lines.length; index += 1) {
    const codes: string[] = [];
    let cursor = index;
    while (cursor < lines.length) {
      const normalized = normalizeLine(lines[cursor]!);
      const matches = findCodeMatches(normalized, page);
      if (!matches.length || moneyValues(normalized).length) break;
      codes.push(...matches.map((match) => match.code));
      cursor += 1;
    }
    if (!codes.length) continue;
    const prices: Array<{ price: string; currency: string }> = [];
    let priceCursor = cursor;
    while (priceCursor < lines.length && prices.length < codes.length) {
      const normalized = normalizeLine(lines[priceCursor]!);
      if (findCodeMatches(normalized, page).length) break;
      const linePrices = moneyValues(normalized);
      if (!linePrices.length && prices.length) break;
      prices.push(...linePrices);
      priceCursor += 1;
    }
    if (prices.length !== codes.length) continue;
    for (let offset = 0; offset < codes.length; offset += 1) {
      const previous = entries.get(codes[offset]!);
      if (previous && !previous.price) entries.set(codes[offset]!, { page: previous.page, ...prices[offset]! });
    }
    index = priceCursor - 1;
  }
}

function moneyValues(line: string): Array<{ price: string; currency: string }> {
  return [...line.matchAll(/(\d{1,3}(?:\.\d{3})*|\d+)(?:,(\d{2}))?\s*([₺€$])/g)].map((money) => ({
    price: `${money[1]!.replace(/\./g, "")}.${money[2] ?? "00"}`,
    currency: currencyForSymbol(money[3]!)
  }));
}

function normalizeLine(line: string): string {
  return line.toLocaleUpperCase("tr-TR").replace(/İ/g, "I");
}

function findCodeMatches(line: string, page: number): Array<{ code: string; start: number; end: number }> {
  const matches: Array<{ code: string; start: number; end: number }> = [];
  const codePattern = /\b[A-Z0-9-]{6,}\b/g;
  for (const match of line.matchAll(codePattern)) {
    const code = match[0]!;
    const isNumeric = /^\d+$/.test(code);
    const allowedNumericPage = numericPages.size === 0 || numericPages.has(page);
    const allowedAlpha = /[A-Z]/.test(code) && /\d/.test(code) &&
      (allowedPrefixes.length === 0 || allowedPrefixes.some((prefix) => code.startsWith(prefix)));
    if ((isNumeric && includeNumericCodes && allowedNumericPage && code.length >= 8 && code.length <= 14) || allowedAlpha) {
      matches.push({ code, start: match.index!, end: match.index! + code.length });
    }
  }
  return matches;
}

function currencyForSymbol(symbol: string): string {
  if (symbol === "€") return "EUR";
  if (symbol === "$") return "USD";
  return "TRY";
}

async function auditImages(urls: string[]): Promise<Array<{ imageUrl: string; error: string }>> {
  const failures: Array<{ imageUrl: string; error: string }> = [];
  let cursor = 0;
  const workers = Array.from({ length: Math.min(8, Math.max(1, urls.length)) }, async () => {
    while (cursor < urls.length) {
      const imageUrl = urls[cursor++]!;
      const filePath = path.join(rootDir, "apps/web/public", imageUrl.split("?", 1)[0]!);
      try {
        if (!existsSync(filePath)) throw new Error("dosya bulunamadı");
        const metadata = await readProductImageMetadata(filePath);
        if (metadata.format !== "webp") throw new Error(`format ${metadata.format ?? "bilinmiyor"}`);
        if (metadata.width !== 1200 || metadata.height !== 1200) throw new Error(`ölçü ${metadata.width ?? 0}x${metadata.height ?? 0}`);
        const bounds = await readProductImageContentBounds(filePath);
        if (!bounds.width || !bounds.height) throw new Error("boş görsel");
        const contentRatio = Math.max(bounds.width / bounds.height, bounds.height / bounds.width);
        if (contentRatio > 8) throw new Error(`ürün yerine tablo/metin şeridi şüphesi (içerik oranı ${contentRatio.toFixed(1)})`);
      } catch (error) {
        failures.push({ imageUrl, error: error instanceof Error ? error.message : "görsel okunamadı" });
      }
    }
  });
  await Promise.all(workers);
  return failures.sort((left, right) => left.imageUrl.localeCompare(right.imageUrl));
}

function requiredOption(name: string): string {
  const value = args.get(name)?.trim();
  if (!value) throw new Error(`--${name}=... zorunludur.`);
  return value;
}

function positiveInteger(value: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) throw new Error(`Geçersiz pozitif sayı: ${value}`);
  return parsed;
}

function clean(value: string | undefined): string {
  return value?.trim() ?? "";
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
