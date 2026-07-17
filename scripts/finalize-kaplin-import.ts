import { execFile as execFileCallback } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

interface Specification {
  label: string;
  value: string;
}

interface ImportProduct {
  id: string;
  sourceRecordId: string;
  sku: string;
  barcode: string;
  manufacturerCode: string;
  productName: string;
  brandName: string;
  categoryName: string;
  categoryPath: string[];
  listPrice: string;
  currency: string;
  taxRate: string;
  unitType: string;
  stockQuantity: number;
  stockStatus: "in_stock" | "low_stock" | "out_of_stock" | "unknown";
  stockQuantityKnown: boolean;
  imageUrl: string;
  sourceUrl: string;
  description: string;
  technicalSpecs: string;
  specifications: Specification[];
  minOrder: number;
  packageQuantity: number;
  cartonQuantity: number;
  palletQuantity: number;
  warrantyMonths: number;
  sourcePage?: number;
  imageRegion?: { x: number; y: number; width: number; height: number };
  extractionWarnings: string[];
  confidenceScore: number;
  duplicateRisk: "none" | "possible" | "high";
  missingFields: string[];
  manuallyReviewed?: boolean;
  excluded?: boolean;
}

interface ImportJob {
  id: string;
  status: string;
  sourceName: string;
  updatedAt: string;
  totalRecords: number;
  acceptedRecords: number;
  extractedProducts: ImportProduct[];
  qualityIssues: Array<{ productId?: string }>;
  notes: string[];
  pdfProgress?: { failedPages: number; failedPageNumbers: number[] };
  pageAudits?: Array<Record<string, unknown> & { pageNumber: number }>;
}

interface ExpectedEntry {
  code: string;
  page: number;
  price: string | null;
  currency: string;
  line: string;
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
const startPage = positiveInteger(args.get("start-page") || "15");
const endPage = positiveInteger(args.get("end-page") || "41");
const expectedCount = positiveInteger(args.get("expected-count") || "1076");
const shouldWrite = args.get("write") === "true";
const codePrefixes = ["EX", "GR", "DRP"];
const numericPages = new Set([26]);
const recoveredPage28Specs = new Map<string, { r: string; r1: string }>([
  ["EX52911120025252", { r: "3/4\"", r1: "3/4\"" }],
  ["EX52911120032322", { r: "1\"", r1: "1\"" }],
  ["EX52911120040402", { r: "1 1/4\"", r1: "1 1/4\"" }],
  ["EX52911120050502", { r: "1 1/2\"", r1: "1 1/2\"" }],
  ["EX52911120063632", { r: "2\"", r1: "2\"" }]
]);

async function main(): Promise<void> {
  if (endPage < startPage) throw new Error("Bitiş sayfası başlangıç sayfasından küçük olamaz.");
  const jobs = JSON.parse(await readFile(jobsPath, "utf8")) as ImportJob[];
  const job = jobs.find((candidate) => candidate.id === jobId);
  if (!job) throw new Error(`Import job bulunamadı: ${jobId}`);
  if (["queued", "processing"].includes(job.status)) throw new Error("PDF işleme tamamlanmadan finalizasyon yapılamaz.");
  if (job.pdfProgress?.failedPages) throw new Error(`Başarısız PDF sayfaları var: ${job.pdfProgress.failedPageNumbers.join(", ")}`);

  const expected = await extractExpectedEntries();
  if (expected.size !== expectedCount) throw new Error(`Beklenen ${expectedCount} kod yerine ${expected.size} benzersiz kod bulundu.`);

  const candidatesByCode = new Map<string, ImportProduct[]>();
  for (const product of job.extractedProducts) {
    for (const code of productCodes(product)) {
      if (!expected.has(code)) continue;
      const bucket = candidatesByCode.get(code) ?? [];
      if (!bucket.includes(product)) bucket.push(product);
      candidatesByCode.set(code, bucket);
    }
  }

  const missingBeforeRecovery = [...expected.keys()].filter((code) => !candidatesByCode.has(code));
  const recoverable = missingBeforeRecovery.filter((code) => recoveredPage28Specs.has(code));
  const unrecoverable = missingBeforeRecovery.filter((code) => !recoveredPage28Specs.has(code));
  if (unrecoverable.length) throw new Error(`Otomatik kurtarılamayan kodlar: ${unrecoverable.join(", ")}`);

  const page28Template = bestProduct(job.extractedProducts.filter((product) =>
    product.sourcePage === 28 && product.sku.startsWith("EX52911") && Boolean(product.imageUrl)
  ));
  if (recoverable.length && !page28Template) throw new Error("28. sayfa kurtarma görseli bulunamadı.");
  for (const code of recoverable) {
    const recovered = recoverPage28Product(code, expected.get(code)!, page28Template!);
    job.extractedProducts.push(recovered);
    candidatesByCode.set(code, [recovered]);
  }

  const selectedByCode = new Map<string, ImportProduct>();
  const sourceBlankPriceConflicts: Array<{ code: string; extractedPrice: string }> = [];
  const correctedPrices: Array<{ code: string; extractedPrice: string; verifiedPrice: string }> = [];
  for (const [code, entry] of expected) {
    const candidates = candidatesByCode.get(code) ?? [];
    const selected = bestProduct(candidates);
    if (!selected) throw new Error(`Ürün seçilemedi: ${code}`);
    if (!entry.price && Number(selected.listPrice) > 0) {
      sourceBlankPriceConflicts.push({ code, extractedPrice: selected.listPrice });
    }
    if (entry.price && (Math.abs(Number(selected.listPrice) - Number(entry.price)) >= 0.005 || selected.currency !== entry.currency)) {
      correctedPrices.push({ code, extractedPrice: `${selected.listPrice} ${selected.currency}`, verifiedPrice: `${entry.price} ${entry.currency}` });
    }
    applyVerifiedFields(selected, entry);
    selectedByCode.set(code, selected);
  }
  if (sourceBlankPriceConflicts.length) {
    throw new Error(`PDF fiyatı boşken AI fiyatı bulunan ${sourceBlankPriceConflicts.length} kayıt var: ${JSON.stringify(sourceBlankPriceConflicts)}`);
  }
  qualifyDisplayNames([...selectedByCode.values()]);

  const selectedIds = new Set([...selectedByCode.values()].map((product) => product.id));
  for (const product of job.extractedProducts) product.excluded = !selectedIds.has(product.id);
  const activeProducts = job.extractedProducts.filter((product) => !product.excluded);
  const activeCodes = new Set(activeProducts.map((product) => product.sku));
  if (activeProducts.length !== expectedCount || activeCodes.size !== expectedCount) {
    throw new Error(`Final kayıt sayısı hatalı: ${activeProducts.length} kayıt / ${activeCodes.size} benzersiz kod.`);
  }

  const pageCounts = new Map<number, number>();
  for (const product of activeProducts) pageCounts.set(product.sourcePage ?? 0, (pageCounts.get(product.sourcePage ?? 0) ?? 0) + 1);
  job.pageAudits = job.pageAudits?.map((audit) => ({
    ...audit,
    extractedProducts: pageCounts.get(audit.pageNumber) ?? 0,
    productsWithImages: activeProducts.filter((product) => product.sourcePage === audit.pageNumber && product.imageUrl).length
  }));
  job.totalRecords = expectedCount;
  job.acceptedRecords = expectedCount;
  job.updatedAt = new Date().toISOString();
  job.qualityIssues = job.qualityIssues.filter((issue) => !issue.productId || selectedIds.has(issue.productId));
  job.notes = uniqueStrings([
    `KAPLİN kesin denetimi: PDF sayfa ${startPage}-${endPage} arasında ${expectedCount} benzersiz ürün kodu doğrulandı.`,
    `${recoverable.length} fiyatı katalogda boş olan satır PDF tablosundan kurtarıldı; fiyat uydurulmadı.`,
    "Kod, fiyat, para birimi, sayfa ve görsel eşleşmeleri deterministik denetim için sabitlendi.",
    ...job.notes
  ]).slice(0, 100);

  const report = {
    jobId,
    expectedProducts: expectedCount,
    activeProducts: activeProducts.length,
    recoveredCodes: recoverable,
    excludedCandidates: job.extractedProducts.length - activeProducts.length,
    correctedPriceCount: correctedPrices.length,
    correctedPriceSample: correctedPrices.slice(0, 20),
    skuQualifiedNameCount: activeProducts.filter((product) => product.productName.endsWith(`(${product.sku})`)).length,
    duplicateDisplayNameCount: duplicateNameGroups(activeProducts).length,
    catalogBlankPriceCodes: [...expected.values()].filter((entry) => entry.price === null).map((entry) => entry.code),
    pageCounts: Object.fromEntries([...pageCounts].sort((left, right) => left[0] - right[0]))
  };

  if (shouldWrite) {
    const temporaryPath = `${jobsPath}.${process.pid}.${Date.now()}.tmp`;
    await writeFile(temporaryPath, `${JSON.stringify(jobs, null, 2)}\n`);
    await rename(temporaryPath, jobsPath);
  }
  console.log(JSON.stringify({ mode: shouldWrite ? "write" : "dry-run", ...report }, null, 2));
}

async function extractExpectedEntries(): Promise<Map<string, ExpectedEntry>> {
  const entries = new Map<string, ExpectedEntry>();
  for (let page = startPage; page <= endPage; page += 1) {
    const { stdout } = await execFile("pdftotext", [
      "-f", String(page), "-l", String(page), "-layout", "-enc", "UTF-8", pdfPath, "-"
    ], { encoding: "utf8", maxBuffer: 8 * 1024 * 1024, timeout: 30_000 });
    const rawLines = stdout.split(/\r?\n/);
    for (const rawLine of rawLines) {
      const line = rawLine.toLocaleUpperCase("tr-TR").replace(/İ/g, "I");
      const matches = codeMatches(line, page);
      for (let index = 0; index < matches.length; index += 1) {
        const match = matches[index]!;
        const segment = line.slice(match.end, matches[index + 1]?.start ?? line.length);
        const money = segment.match(/(\d{1,3}(?:\.\d{3})*|\d+)(?:,(\d{2}))?\s*([₺€$])/);
        const next: ExpectedEntry = {
          code: match.code,
          page,
          price: money ? `${money[1]!.replace(/\./g, "")}.${money[2] ?? "00"}` : null,
          currency: money?.[3] === "€" ? "EUR" : money?.[3] === "$" ? "USD" : "TRY",
          line: rawLine.trim()
        };
        const previous = entries.get(match.code);
        if (previous?.price && next.price && (previous.price !== next.price || previous.currency !== next.currency)) {
          throw new Error(`${match.code} için çelişkili fiyat: ${previous.price} ve ${next.price}`);
        }
        if (!previous || (!previous.price && next.price)) entries.set(match.code, next);
      }
    }
    assignWrappedPrices(rawLines, page, entries);
  }
  return entries;
}

function assignWrappedPrices(lines: string[], page: number, entries: Map<string, ExpectedEntry>): void {
  for (let index = 0; index < lines.length; index += 1) {
    const codes: Array<{ code: string; line: string }> = [];
    let cursor = index;
    while (cursor < lines.length) {
      const line = lines[cursor]!.toLocaleUpperCase("tr-TR").replace(/İ/g, "I");
      const matches = codeMatches(line, page);
      if (!matches.length || moneyValues(line).length) break;
      codes.push(...matches.map((match) => ({ code: match.code, line: lines[cursor]!.trim() })));
      cursor += 1;
    }
    if (!codes.length) continue;
    const prices: Array<{ price: string; currency: string }> = [];
    let priceCursor = cursor;
    while (priceCursor < lines.length && prices.length < codes.length) {
      const line = lines[priceCursor]!.toLocaleUpperCase("tr-TR").replace(/İ/g, "I");
      if (codeMatches(line, page).length) break;
      const linePrices = moneyValues(line);
      if (!linePrices.length && prices.length) break;
      prices.push(...linePrices);
      priceCursor += 1;
    }
    if (prices.length !== codes.length) continue;
    for (let offset = 0; offset < codes.length; offset += 1) {
      const code = codes[offset]!;
      const price = prices[offset]!;
      const previous = entries.get(code.code);
      if (previous && !previous.price) entries.set(code.code, { ...previous, ...price, line: code.line });
    }
    index = priceCursor - 1;
  }
}

function moneyValues(line: string): Array<{ price: string; currency: string }> {
  return [...line.matchAll(/(\d{1,3}(?:\.\d{3})*|\d+)(?:,(\d{2}))?\s*([₺€$])/g)].map((money) => ({
    price: `${money[1]!.replace(/\./g, "")}.${money[2] ?? "00"}`,
    currency: money[3] === "€" ? "EUR" : money[3] === "$" ? "USD" : "TRY"
  }));
}

function codeMatches(line: string, page: number): Array<{ code: string; start: number; end: number }> {
  const matches: Array<{ code: string; start: number; end: number }> = [];
  for (const match of line.matchAll(/\b[A-Z0-9-]{6,}\b/g)) {
    const code = match[0]!;
    const alphaCode = /[A-Z]/.test(code) && /\d/.test(code) && codePrefixes.some((prefix) => code.startsWith(prefix));
    const numericCode = numericPages.has(page) && /^\d{8,14}$/.test(code);
    if (alphaCode || numericCode) matches.push({ code, start: match.index!, end: match.index! + code.length });
  }
  return matches;
}

function productCodes(product: ImportProduct): string[] {
  const values = [product.sku, product.manufacturerCode, product.sourceRecordId].map(canonicalCode).filter(Boolean);
  return [...new Set(values.flatMap((value) => {
    const exact = value.match(/^(?:EX|GR|DRP)[A-Z0-9-]*\d[A-Z0-9-]*$|^\d{8,14}$/)?.[0];
    if (exact) return [exact];
    return value.match(/(?:EX|GR|DRP)[A-Z0-9-]*\d[A-Z0-9-]*|\b\d{8,14}\b/g) ?? [];
  }))];
}

function bestProduct(products: ImportProduct[]): ImportProduct | undefined {
  return [...products].sort((left, right) => productScore(right) - productScore(left))[0];
}

function productScore(product: ImportProduct): number {
  return (product.imageUrl ? 1_000 : 0) + (Number(product.listPrice) > 0 ? 200 : 0) +
    product.specifications.length * 3 + product.confidenceScore - (product.excluded ? 500 : 0);
}

function applyVerifiedFields(product: ImportProduct, expected: ExpectedEntry): void {
  product.sku = expected.code;
  product.manufacturerCode = expected.code;
  product.sourceRecordId = expected.code;
  product.sourcePage = expected.page;
  product.sourceUrl = `KAPLİN TL 2025.pdf#page=${expected.page}`;
  product.listPrice = expected.price ?? "0.00";
  product.currency = expected.currency;
  product.brandName = "PİMTAŞ";
  product.categoryName = "Sulama sistemleri ve bağlantı elemanları";
  product.categoryPath = ["Sulama & Bahçe", "Sulama Sistemleri", "Bağlantı Elemanları"];
  product.stockQuantity = 0;
  product.stockStatus = "unknown";
  product.stockQuantityKnown = false;
  product.confidenceScore = Math.max(95, product.confidenceScore);
  product.duplicateRisk = "none";
  product.manuallyReviewed = true;
  product.excluded = false;
  product.missingFields = expected.price ? product.missingFields.filter((field) => field !== "listPrice") : uniqueStrings([...product.missingFields, "listPrice"]);
  product.extractionWarnings = uniqueStrings([
    `PDF ürün kodu ve ${expected.price ? "fiyatı" : "fiyat boşluğu"} kaynak sayfa ${expected.page} üzerinden doğrulandı.`,
    ...product.extractionWarnings
  ]);
}

function recoverPage28Product(code: string, expected: ExpectedEntry, template: ImportProduct): ImportProduct {
  const spec = recoveredPage28Specs.get(code)!;
  const specifications: Specification[] = [
    { label: "D", value: "200 mm" },
    { label: "R", value: spec.r },
    { label: "R1", value: spec.r1 },
    { label: "Basınç Pn", value: "16" },
    { label: "L", value: "262 mm" },
    { label: "H", value: "230 mm" },
    { label: "Koli Adet", value: "9" },
    { label: "Poşet İçi Adet", value: "1" }
  ];
  return {
    ...template,
    id: `prod-${randomUUID()}`,
    sourceRecordId: code,
    sku: code,
    barcode: "",
    manufacturerCode: code,
    productName: `PP Çift Çıkışlı Civatalı Priz Kolye - 200 / ${spec.r}`,
    listPrice: "0.00",
    currency: expected.currency,
    description: "PP Both Sides Socketed Clamp Saddle With Screws. Katalogda fiyat alanı boş bırakılmıştır; temsilci fiyatı ile satılır.",
    technicalSpecs: specifications.map((item) => `${item.label}: ${item.value}`).join(" | "),
    specifications,
    packageQuantity: 1,
    cartonQuantity: 9,
    sourcePage: 28,
    sourceUrl: "KAPLİN TL 2025.pdf#page=28",
    extractionWarnings: ["PDF sayfa 28 tablosundaki fiyatı boş satır, ürün kodu ve teknik ölçüleriyle deterministik olarak kurtarıldı."],
    confidenceScore: 95,
    duplicateRisk: "none",
    missingFields: ["listPrice", "stockQuantity"],
    manuallyReviewed: true,
    excluded: false
  };
}

function qualifyDisplayNames(products: ImportProduct[]): void {
  for (const product of products) {
    const qualifier = primaryQualifier(product.specifications);
    if (qualifier && !containsComparable(product.productName, qualifier)) {
      product.productName = `${product.productName} - ${qualifier}`;
    }
  }

  for (const group of duplicateNameGroups(products)) {
    const distinguishingLabels = distinctSpecificationLabels(group);
    for (const product of group) {
      const specification = distinguishingLabels
        .map((label) => product.specifications.find((item) => normalizeLabel(item.label) === label))
        .find((item) => item?.value && !containsComparable(product.productName, item.value));
      if (specification) product.productName = `${product.productName} - ${cleanDimension(specification.value)}`;
    }
  }

  for (const group of duplicateNameGroups(products)) {
    for (const product of group) product.productName = `${product.productName} (${product.sku})`;
  }
}

function primaryQualifier(specifications: Specification[]): string {
  const findValue = (...labels: string[]): string => {
    const entry = specifications.find((item) => labels.some((label) => normalizeLabel(item.label) === label));
    return cleanDimension(entry?.value ?? "");
  };
  const diameter = findValue("cap", "dia", "d");
  const measure = findValue("olcu", "ebat", "size", "dimension");
  const r = findValue("r", "rp");
  const r1 = findValue("r1");
  const primary = diameter || measure;
  if (!primary) return "";
  const parts = [primary];
  if (r && !containsComparable(primary, r)) parts.push(r);
  if (r1 && !containsComparable(primary, r1) && !containsComparable(r, r1)) parts.push(r1);
  return parts.join(" x ");
}

function duplicateNameGroups(products: ImportProduct[]): ImportProduct[][] {
  const groups = new Map<string, ImportProduct[]>();
  for (const product of products) {
    const key = product.productName.toLocaleLowerCase("tr-TR").replace(/\s+/g, " ").trim();
    groups.set(key, [...(groups.get(key) ?? []), product]);
  }
  return [...groups.values()].filter((group) => group.length > 1);
}

function distinctSpecificationLabels(products: ImportProduct[]): string[] {
  const priorities = [
    "damlatici araligi", "dropping range", "et kalinligi", "wall thickness", "debi", "flow",
    "basinc pn", "basinc", "koli adet", "poset ici adet"
  ];
  const valuesByLabel = new Map<string, Set<string>>();
  for (const product of products) {
    for (const specification of product.specifications) {
      const label = normalizeLabel(specification.label);
      const values = valuesByLabel.get(label) ?? new Set<string>();
      values.add(cleanDimension(specification.value));
      valuesByLabel.set(label, values);
    }
  }
  return [...valuesByLabel]
    .filter(([, values]) => values.size > 1)
    .map(([label]) => label)
    .sort((left, right) => {
      const leftPriority = priorities.indexOf(left);
      const rightPriority = priorities.indexOf(right);
      return (leftPriority < 0 ? priorities.length : leftPriority) - (rightPriority < 0 ? priorities.length : rightPriority) || left.localeCompare(right, "tr");
    });
}

function normalizeLabel(value: string): string {
  return value.toLocaleLowerCase("tr-TR")
    .replace(/ı/g, "i")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\([^)]*\)/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function cleanDimension(value: string): string {
  return value.trim().replace(/\s*mm\b/gi, " mm").replace(/\s+/g, " ");
}

function containsComparable(haystack: string, needle: string): boolean {
  const normalize = (value: string) => value.toLocaleLowerCase("tr-TR")
    .replace(/[”″]/g, '"')
    .replace(/\bmm\b|\bcm\b/g, "")
    .replace(/[^a-z0-9]+/g, "");
  const normalizedNeedle = normalize(needle);
  return normalizedNeedle.length >= 2 && normalize(haystack).includes(normalizedNeedle);
}

function canonicalCode(value: string): string {
  return value.toLocaleUpperCase("tr-TR").replace(/İ/g, "I").replace(/\s+/g, "").trim();
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
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

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
