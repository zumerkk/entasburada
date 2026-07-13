import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";

type ImportJobStatus = "queued" | "processing" | "needs_review" | "preview" | "approved" | "rejected" | "failed";

type ImportJobSummary = {
  id: string;
  status: ImportJobStatus;
  sourceName: string;
  fileName: string;
  progressPercent?: number;
  pageCount?: number;
  processedPages?: number;
  totalRecords: number;
  acceptedRecords: number;
  lastError?: string;
};

type ImportJob = {
  id: string;
  status: ImportJobStatus;
  sourceName: string;
  fileName: string;
  extractedProducts: Array<{ id: string; imageUrl?: string; excluded?: boolean }>;
  pdfProgress?: {
    pageCount: number;
    startPage: number;
    endPage: number;
    processedPages: number;
    failedPages: number;
    percent: number;
  };
  lastError?: string;
};

type CatalogHints = {
  sourceName: string;
  brandHint?: string;
  categoryHint?: string;
  defaultCurrency: "TRY" | "USD";
};

const rootDir = path.resolve(import.meta.dirname, "..");
const args = new Map(
  process.argv.slice(2).map((argument) => {
    const [key, ...value] = argument.replace(/^--/, "").split("=");
    return [key, value.join("=") || "true"];
  })
);
const inputDir = path.resolve(rootDir, args.get("dir") || "Pdfler");
const baseUrl = (args.get("base-url") || process.env.PDF_IMPORT_BASE_URL || "http://127.0.0.1:3000").replace(/\/$/, "");
const batchSize = Math.max(1, Math.min(3, Number(args.get("batch-size")) || 3));
const concurrency = Math.max(1, Math.min(3, Number(args.get("concurrency")) || 1));
const enqueueOnly = args.get("enqueue-only") === "true";
const only = normalize(args.get("only") || "");
const sessionSecret = process.env.ADMIN_SESSION_SECRET?.trim();

if (!sessionSecret) {
  throw new Error("ADMIN_SESSION_SECRET tanımlı değil. Komutu apps/web/.env.local ile çalıştırın.");
}

const cookieHeader = `entas_admin_session=${sessionSecret}`;

async function main(): Promise<void> {
  const sourceJobs = await loadSourceJobs();
  const files = await listPdfFiles();
  if (files.length === 0) throw new Error(`${inputDir} içinde PDF bulunamadı.`);

  console.log(`${files.length} PDF bulundu. Yönetim kuyruğu hazırlanıyor...`);
  const jobs: ImportJobSummary[] = [];

  for (const filePath of files) {
    const hints = catalogHints(path.basename(filePath));
    const existing = sourceJobs.find((job) => job.sourceName === hints.sourceName);
    if (existing) {
      jobs.push(existing);
      console.log(`MEVCUT  ${existing.sourceName} (${existing.processedPages ?? 0}/${existing.pageCount ?? 0} sayfa)`);
      continue;
    }

    const job = await enqueuePdf(filePath, hints);
    const summary = summarizeJob(job);
    jobs.push(summary);
    sourceJobs.unshift(summary);
    console.log(`KUYRUK  ${job.sourceName} (${job.pdfProgress?.pageCount ?? 0} sayfa)`);
  }

  if (enqueueOnly) {
    console.log(`Kuyruk hazır. ${jobs.length} katalog admin yönetim listesine alındı.`);
    return;
  }

  console.log(`${concurrency} kontrollü işçi kullanılacak; admin onayı olmadan yayına alınmayacak.`);
  const processable: ImportJobSummary[] = [];
  for (const summary of jobs) {
    if (["needs_review", "preview", "approved", "rejected"].includes(summary.status)) {
      console.log(`HAZIR   ${summary.sourceName} (${summary.acceptedRecords} aday)`);
      continue;
    }
    if (summary.status === "failed" && (summary.processedPages ?? 0) >= (summary.pageCount ?? 0)) {
      console.log(`KONTROL ${summary.sourceName} · ürün adayı bulunamadı; iş tamamlandı ve admin kontrolü gerekiyor.`);
      continue;
    }
    processable.push(summary);
  }
  let nextJobIndex = 0;
  const workerErrors: string[] = [];
  let quotaBlocked = false;
  await Promise.all(
    Array.from({ length: Math.min(concurrency, processable.length) }, async () => {
      while (!quotaBlocked && nextJobIndex < processable.length) {
        const summary = processable[nextJobIndex++]!;
        try {
          await processJob(summary);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          if (/AI_KOTA_BEKLIYOR|AI sağlayıcı kotası dolu/i.test(message)) {
            quotaBlocked = true;
            console.error("KOTA     AI sağlayıcı kotası dolu; hiçbir yeni sayfa hatalı sayılmadan import güvenli biçimde duraklatıldı.");
            break;
          }
          workerErrors.push(`${summary.sourceName}: ${message}`);
          console.error(`BEKLEME ${summary.sourceName} · ${message} · sonraki çalıştırmada kaldığı yerden devam eder.`);
        }
      }
    })
  );

  if (quotaBlocked) {
    console.log(`DURAKLATILDI  Kredi/kota yenilendikten sonra aynı komut kaldığı sayfadan devam eder: ${baseUrl}/admin/ai-import`);
    process.exitCode = 2;
    return;
  }

  const finalJobs = await loadSourceJobs();
  const selected = finalJobs.filter((job) => job.sourceName.startsWith("Pdfler / "));
  const products = selected.reduce((sum, job) => sum + job.acceptedRecords, 0);
  const failures = selected.filter((job) => job.status === "failed" || job.lastError);
  console.log(`TAMAMLANDI  ${selected.length} katalog, ${products} aktif aday, ${failures.length} hata kayıtlı iş, ${workerErrors.length} geçici işçi hatası.`);
  console.log(`${baseUrl}/admin/ai-import`);
}

async function listPdfFiles(): Promise<string[]> {
  const entries = await readdir(inputDir, { withFileTypes: true });
  const files = entries
    .filter((entry) => entry.isFile() && entry.name.toLocaleLowerCase("tr-TR").endsWith(".pdf"))
    .map((entry) => path.join(inputDir, entry.name));
  const withSizes = await Promise.all(files.map(async (filePath) => ({ filePath, size: (await stat(filePath)).size })));
  return withSizes
    .filter(({ filePath }) => !only || normalize(path.basename(filePath)).includes(only))
    .sort((left, right) => left.size - right.size || left.filePath.localeCompare(right.filePath, "tr"))
    .map(({ filePath }) => filePath);
}

async function loadSourceJobs(): Promise<ImportJobSummary[]> {
  const response = await fetchWithRetry(`${baseUrl}/api/admin/import/sources`, {
    headers: { cookie: cookieHeader }
  });
  const payload = (await response.json()) as { jobs?: ImportJobSummary[]; error?: string };
  if (!response.ok || !payload.jobs) {
    throw new Error(payload.error || `Admin API erişilemiyor (${response.status}). Önce yerel web sunucusunu başlatın.`);
  }
  return payload.jobs;
}

async function enqueuePdf(filePath: string, hints: CatalogHints): Promise<ImportJob> {
  const bytes = await readFile(filePath);
  const formData = new FormData();
  formData.set("file", new File([bytes], path.basename(filePath), { type: "application/pdf" }));
  formData.set("sourceName", hints.sourceName);
  formData.set("defaultCurrency", hints.defaultCurrency);
  if (hints.brandHint) formData.set("brandHint", hints.brandHint);
  if (hints.categoryHint) formData.set("categoryHint", hints.categoryHint);

  const response = await fetch(`${baseUrl}/api/admin/import/pdf`, {
    method: "POST",
    headers: { cookie: cookieHeader },
    body: formData,
    signal: AbortSignal.timeout(30 * 60_000)
  });
  const payload = (await response.json()) as { job?: ImportJob; error?: string };
  if (!response.ok || !payload.job) throw new Error(`${path.basename(filePath)}: ${payload.error || `yükleme hatası (${response.status})`}`);
  return payload.job;
}

async function processJob(initial: ImportJobSummary): Promise<void> {
  let current: ImportJob | null = null;
  let status = initial.status;
  while (["queued", "processing"].includes(status)) {
    const response = await fetchWithRetry(`${baseUrl}/api/admin/import/process`, {
      method: "POST",
      headers: { cookie: cookieHeader, "content-type": "application/json" },
      body: JSON.stringify({ jobId: initial.id, batchSize })
    }, 4, 45 * 60_000);
    const payload = (await response.json()) as { job?: ImportJob; error?: string };
    if (!response.ok || !payload.job) {
      throw new Error(`${initial.sourceName}: ${payload.error || `işleme hatası (${response.status})`}`);
    }
    current = payload.job;
    status = current.status;
    const progress = current.pdfProgress;
    const activeCount = current.extractedProducts.filter((product) => !product.excluded).length;
    const imageCount = current.extractedProducts.filter((product) => !product.excluded && product.imageUrl).length;
    console.log(
      `İŞLENİYOR ${current.sourceName} ${progress?.processedPages ?? 0}/${progress ? progress.endPage - progress.startPage + 1 : 0} ` +
      `(%${progress?.percent ?? 0}) · ${activeCount} aday · ${imageCount} görsel · ${progress?.failedPages ?? 0} sayfa hatası`
    );
  }

  if (current) {
    const activeCount = current.extractedProducts.filter((product) => !product.excluded).length;
    const imageCount = current.extractedProducts.filter((product) => !product.excluded && product.imageUrl).length;
    console.log(`KONTROL ${current.sourceName} · ${activeCount} aktif aday · ${imageCount} görselli · durum ${current.status}`);
  }
}

async function fetchWithRetry(url: string, init: RequestInit, attempts = 3, timeoutMs = 30_000): Promise<Response> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
      if (![429, 502, 503, 504].includes(response.status) || attempt === attempts) return response;
      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
      if (attempt === attempts) throw error;
    }
    await new Promise((resolve) => setTimeout(resolve, Math.min(15_000, 1_500 * 2 ** (attempt - 1))));
  }
  throw lastError instanceof Error ? lastError : new Error("İstek yeniden denemelerden sonra başarısız oldu.");
}

function catalogHints(fileName: string): CatalogHints {
  const base = fileName.replace(/\.pdf(?:\.pdf)?$/i, "").replace(/\s+/g, " ").trim();
  const sourceName = `Pdfler / ${base}`;
  const normalized = normalize(base);

  if (normalized.includes("onay")) return { sourceName, brandHint: "ONAY", categoryHint: "Boya ve yapı kimyasalları", defaultCurrency: "TRY" };
  if (normalized.includes("sulama")) return { sourceName, categoryHint: "Sulama sistemleri ve bağlantı elemanları", defaultCurrency: "TRY" };
  if (normalized.includes("ym fiyat")) return { sourceName, brandHint: "ENTAŞ", categoryHint: "Su depoları", defaultCurrency: "TRY" };
  if (normalized.includes("bk 2026")) return { sourceName, categoryHint: "Banyo ve mutfak", defaultCurrency: "TRY" };
  if (normalized.includes("fiyat listesi subat")) return { sourceName, categoryHint: "Banyo mobilyaları", defaultCurrency: "TRY" };
  if (normalized.includes("lamindoor")) return { sourceName, brandHint: "LAMINDOOR", categoryHint: "Kapı paneli ve yüzeyleri", defaultCurrency: "TRY" };
  if (normalized.includes("sgs")) return { sourceName, brandHint: "SGS", categoryHint: "El aletleri ve iş güvenliği", defaultCurrency: "TRY" };
  if (normalized.includes("tricraft")) return { sourceName, categoryHint: "Teknik hırdavat ve el aletleri", defaultCurrency: "USD" };
  if (normalized.includes("floorpan")) return { sourceName, brandHint: "FLOORPAN", categoryHint: "Laminat parke", defaultCurrency: "TRY" };
  if (normalized.includes("forzaitalia")) return { sourceName, brandHint: "FORZA", categoryHint: "Pompa ve hidrofor sistemleri", defaultCurrency: "TRY" };
  return { sourceName, defaultCurrency: "TRY" };
}

function summarizeJob(job: ImportJob): ImportJobSummary {
  return {
    id: job.id,
    status: job.status,
    sourceName: job.sourceName,
    fileName: job.fileName,
    progressPercent: job.pdfProgress?.percent,
    pageCount: job.pdfProgress?.pageCount,
    processedPages: job.pdfProgress?.processedPages,
    totalRecords: job.extractedProducts.length,
    acceptedRecords: job.extractedProducts.filter((product) => !product.excluded).length,
    lastError: job.lastError
  };
}

function normalize(value: string): string {
  return value
    .trim()
    .toLocaleLowerCase("tr-TR")
    .replace(/[ç]/g, "c")
    .replace(/[ğ]/g, "g")
    .replace(/[ı]/g, "i")
    .replace(/[ö]/g, "o")
    .replace(/[ş]/g, "s")
    .replace(/[ü]/g, "u");
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
