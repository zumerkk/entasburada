import "server-only";
import { execFile as execFileCallback } from "node:child_process";
import { randomUUID } from "node:crypto";
import { constants, existsSync } from "node:fs";
import { access, mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import sharp from "sharp";
import type { CatalogImageRegion } from "./catalog-ai-extractor";
import type { PdfWordBox } from "./pdf-grid-image-regions";
import { normalizeProductImage } from "./product-image-normalizer";

const execFile = promisify(execFileCallback);
const rootDir = findWorkspaceRoot(process.cwd());
const privateImportDir = path.join(rootDir, "data", "catalog-imports");
const publicImportDir = path.join(rootDir, "apps", "web", "public", "uploads", "catalog-imports");

export interface PdfDocumentInfo {
  pageCount: number;
  title: string;
  producer: string;
  pageSize: string;
}

export interface StoredPdfSource {
  filePath: string;
  originalFileName: string;
  size: number;
}

export interface RenderedPdfPage {
  filePath: string;
  imageBase64: string;
  coordinateImageBase64: string;
  width: number;
  height: number;
}

export interface EmbeddedPdfImageRegion {
  index: number;
  region: CatalogImageRegion;
}

export interface PdfModelOcrHints {
  modelCandidates: string[];
  phasePairs: Array<{ singlePhase: string; threePhase: string }>;
  phaseTableDetected: boolean;
}

export interface ExtractedEmbeddedImage {
  index: number;
  xref: number;
  duplicate: boolean;
  region: CatalogImageRegion;
  originalWidth: number;
  originalHeight: number;
  ext?: string;
  colorSpace?: string;
  bpc?: number;
  sizeBytes?: number;
  quality: number;
  filePath?: string;
  base64?: string;
}

export async function validateAndStorePdf(input: {
  jobId: string;
  fileName: string;
  buffer: Buffer;
}): Promise<StoredPdfSource> {
  const maxBytes = Math.max(5, Number(process.env.CATALOG_PDF_MAX_MB) || 120) * 1024 * 1024;
  if (input.buffer.length > maxBytes) {
    throw new Error(`PDF en fazla ${Math.round(maxBytes / 1024 / 1024)} MB olabilir.`);
  }
  if (input.buffer.length < 8 || input.buffer.subarray(0, 5).toString("ascii") !== "%PDF-") {
    throw new Error("Dosya geçerli bir PDF değil.");
  }

  const jobDir = path.join(privateImportDir, safeSegment(input.jobId));
  await mkdir(jobDir, { recursive: true });
  const filePath = path.join(jobDir, "source.pdf");
  await writeFile(filePath, input.buffer, { mode: 0o600 });
  return {
    filePath,
    originalFileName: sanitizeFileName(input.fileName) || "catalog.pdf",
    size: input.buffer.length
  };
}

export async function inspectPdf(filePath: string): Promise<PdfDocumentInfo> {
  const binary = await resolvePopplerBinary("pdfinfo");
  const { stdout } = await execFile(binary, [filePath], { maxBuffer: 4 * 1024 * 1024, timeout: 30_000 });
  const values = new Map<string, string>();
  for (const line of stdout.split(/\r?\n/)) {
    const match = line.match(/^([^:]+):\s*(.*)$/);
    if (match?.[1]) values.set(match[1].trim(), (match[2] ?? "").trim());
  }

  const pageCount = Number(values.get("Pages"));
  if (!Number.isInteger(pageCount) || pageCount <= 0) {
    throw new Error("PDF sayfa sayısı okunamadı.");
  }
  const maxPages = Math.max(1, Number(process.env.CATALOG_PDF_MAX_PAGES) || 400);
  if (pageCount > maxPages) {
    throw new Error(`PDF ${pageCount} sayfa; izin verilen üst sınır ${maxPages}.`);
  }

  return {
    pageCount,
    title: values.get("Title") ?? "",
    producer: values.get("Producer") ?? "",
    pageSize: values.get("Page size") ?? ""
  };
}

export async function renderPdfPage(jobId: string, sourcePath: string, pageNumber: number): Promise<RenderedPdfPage> {
  const pageDir = path.join(privateImportDir, safeSegment(jobId), "pages");
  await mkdir(pageDir, { recursive: true });
  const prefix = path.join(pageDir, `page-${String(pageNumber).padStart(4, "0")}`);
  const filePath = `${prefix}.jpg`;

  if (!existsSync(filePath)) {
    const binary = await resolvePopplerBinary("pdftoppm");
    const dpi = clamp(Number(process.env.CATALOG_PDF_RENDER_DPI) || 250, 110, 400);
    await execFile(
      binary,
      ["-f", String(pageNumber), "-l", String(pageNumber), "-singlefile", "-jpeg", "-jpegopt", "quality=92", "-r", String(dpi), sourcePath, prefix],
      { maxBuffer: 16 * 1024 * 1024, timeout: 120_000 }
    );
  }

  const image = await readFile(filePath);
  const metadata = await sharp(image).metadata();
  if (!metadata.width || !metadata.height) {
    throw new Error(`PDF sayfa ${pageNumber} görüntüsü oluşturulamadı.`);
  }

  const coordinateImage = await createCoordinateReferenceImage(image, metadata.width, metadata.height);
  return {
    filePath,
    imageBase64: image.toString("base64"),
    coordinateImageBase64: coordinateImage.toString("base64"),
    width: metadata.width,
    height: metadata.height
  };
}

async function createCoordinateReferenceImage(image: Buffer, width: number, height: number): Promise<Buffer> {
  const fontSize = Math.max(14, Math.round(width / 85));
  const lines: string[] = [];
  for (let step = 0; step <= 10; step += 1) {
    const x = Math.round((step / 10) * width);
    const y = Math.round((step / 10) * height);
    const label = step * 100;
    lines.push(`<line x1="${x}" y1="0" x2="${x}" y2="${height}" stroke="#dc2626" stroke-width="1" stroke-opacity="0.45"/>`);
    lines.push(`<line x1="0" y1="${y}" x2="${width}" y2="${y}" stroke="#2563eb" stroke-width="1" stroke-opacity="0.45"/>`);
    if (step < 10) {
      lines.push(`<rect x="${Math.min(x + 3, width - fontSize * 4)}" y="2" width="${fontSize * 3.2}" height="${fontSize + 6}" fill="white" fill-opacity="0.82"/>`);
      lines.push(`<text x="${Math.min(x + 5, width - fontSize * 4)}" y="${fontSize + 2}" font-family="Arial, sans-serif" font-size="${fontSize}" font-weight="700" fill="#991b1b">x${label}</text>`);
      lines.push(`<rect x="2" y="${Math.min(y + 3, height - fontSize - 8)}" width="${fontSize * 3.2}" height="${fontSize + 6}" fill="white" fill-opacity="0.82"/>`);
      lines.push(`<text x="4" y="${Math.min(y + fontSize + 3, height - 3)}" font-family="Arial, sans-serif" font-size="${fontSize}" font-weight="700" fill="#1d4ed8">y${label}</text>`);
    }
  }
  const overlay = Buffer.from(`<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">${lines.join("")}</svg>`);
  return sharp(image).composite([{ input: overlay, top: 0, left: 0 }]).jpeg({ quality: 86 }).toBuffer();
}

export async function extractPdfPageText(sourcePath: string, pageNumber: number): Promise<string> {
  const binary = await resolvePopplerBinary("pdftotext");
  const { stdout } = await execFile(binary, ["-f", String(pageNumber), "-l", String(pageNumber), "-layout", "-enc", "UTF-8", sourcePath, "-"], {
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
    timeout: 60_000
  });
  return stdout.replace(/\u0000/g, "").trim();
}

export async function extractPdfModelOcrHints(pageFilePath: string): Promise<PdfModelOcrHints> {
  if (process.env.CATALOG_MODEL_OCR === "false") return { modelCandidates: [], phasePairs: [], phaseTableDetected: false };
  const binary = await resolveTesseractBinary();
  if (!binary) return { modelCandidates: [], phasePairs: [], phaseTableDetected: false };

  const metadata = await sharp(pageFilePath).metadata();
  if (!metadata.width || !metadata.height) return { modelCandidates: [], phasePairs: [], phaseTableDetected: false };
  const runId = randomUUID().slice(0, 8);
  const pageDir = path.dirname(pageFilePath);
  const bandHeight = Math.max(260, Math.round(metadata.height * 0.2));
  const bandStep = Math.max(210, Math.round(metadata.height * 0.16));
  const bandLeft = Math.round(metadata.width * 0.05);
  const bandWidth = Math.max(300, Math.round(metadata.width * 0.38));
  const bandPaths: string[] = [];

  try {
    for (let top = 0, index = 0; top < metadata.height; top += bandStep, index += 1) {
      const height = Math.min(bandHeight, metadata.height - top);
      if (height < 100) break;
      const bandPath = path.join(pageDir, `.ocr-${runId}-${String(index).padStart(2, "0")}.png`);
      const band = await sharp(pageFilePath)
        .extract({ left: bandLeft, top, width: Math.min(bandWidth, metadata.width - bandLeft), height })
        .resize({ width: bandWidth * 3, height: height * 3, fit: "fill" })
        .grayscale()
        .normalize()
        .sharpen()
        .png()
        .toBuffer();
      await writeFile(bandPath, band);
      bandPaths.push(bandPath);
    }

    const inputs = [{ filePath: pageFilePath, psm: "11" }, ...bandPaths.map((filePath) => ({ filePath, psm: "6" }))];
    const outputs = await Promise.all(inputs.map(async (input) => {
      const { stdout } = await execFile(binary, [
        input.filePath,
        "stdout",
        "-l",
        process.env.TESSERACT_LANG || "eng",
        "--psm",
        input.psm
      ], {
        encoding: "utf8",
        maxBuffer: 16 * 1024 * 1024,
        timeout: 45_000
      });
      return stdout;
    }));
    const ocrText = outputs.join("\n");
    return {
      modelCandidates: parseOcrModelCodeCandidates(ocrText),
      phasePairs: parseOcrPhasePairs(ocrText),
      phaseTableDetected: ocrPhaseTableDetected(ocrText)
    };
  } catch {
    return { modelCandidates: [], phasePairs: [], phaseTableDetected: false };
  } finally {
    await Promise.allSettled(bandPaths.map((filePath) => unlink(filePath)));
  }
}

function ocrPhaseTableDetected(text: string): boolean {
  const normalized = text.toLocaleUpperCase("en-US").replace(/[^A-Z0-9]+/g, " ");
  return (
    (normalized.includes("SINGLE PHASE") && normalized.includes("THREE PHASE")) ||
    (normalized.includes("220V") && normalized.includes("380V")) ||
    (normalized.includes("TEK FAZ") && normalized.includes("UC FAZ"))
  );
}

export async function extractPdfModelCodeCandidates(pageFilePath: string): Promise<string[]> {
  return (await extractPdfModelOcrHints(pageFilePath)).modelCandidates;
}

export function parseOcrModelCodeCandidates(text: string): string[] {
  const upper = text
    .toLocaleUpperCase("tr-TR")
    .replace(/İ/g, "I")
    .replace(/\b(STM|ST|TLP|TLPM|WFD|TCP)\s+(?=\d)/g, "$1")
    .replace(/\s*([()/_.,-])\s*/g, "$1");
  const hasFourStFamily = /4STM?\d|4STM?\d(?:-|\/)/.test(upper) || /4STM3-4-6-8-16/.test(upper);
  const candidates = upper.match(/[A-Z0-9][A-Z0-9()/_.,-]{2,39}/g) ?? [];
  const fourStCandidates = hasFourStFamily
    ? (upper.match(/(?:4|A)?STM?[0-9B]+(?:-[0-9]+)+/g) ?? []).map((value) => value
        .replace(/^A/, "4")
        .replace(/^STM/, "4STM")
        .replace(/^ST/, "4ST")
        .replace(/^4STMB/, "4STM8")
        .replace(/^4STB/, "4ST8"))
    : [];
  const normalized = [...fourStCandidates, ...candidates]
    .map((value) => value.replace(/^[.,/_-]+|[.,/_-]+$/g, ""))
    .map((value) => hasFourStFamily ? value.replace(/^A(?=STM?\d)/, "4").replace(/^STM(?=\d)/, "4STM") : value)
    .filter((value) => /[A-Z]/.test(value) && /\d/.test(value))
    .filter((value) => !/^(?:\d+(?:[.,]\d+)?(?:V|HZ|KW|HP|MM|CM|RPM|M3|L|MIN)|M3\/H|L\/MIN|220V|380V|50HZ)$/i.test(value))
    .filter((value) => value.length >= 4 && value.length <= 40);
  return Array.from(new Set(normalized)).slice(0, 180);
}

export function parseOcrPhasePairs(text: string): Array<{ singlePhase: string; threePhase: string }> {
  const pairs = new Map<string, { singlePhase: string; threePhase: string }>();
  for (const line of text.split(/\r?\n/)) {
    const codes = (line.toLocaleUpperCase("tr-TR").replace(/İ/g, "I").match(/(?:4|A)?STM?[0-9B]+(?:-[0-9]+)+/g) ?? [])
      .map((value) => value
        .replace(/^A/, "4")
        .replace(/^STM/, "4STM")
        .replace(/^ST/, "4ST")
        .replace(/^4STMB/, "4STM8")
        .replace(/^4STB/, "4ST8"));
    for (const singlePhase of codes.filter((code) => /^4STM\d/.test(code))) {
      const stem = singlePhase.replace(/^4STM/, "4ST");
      const threePhase = codes.find((code) => code === stem);
      if (threePhase) pairs.set(`${singlePhase}|${threePhase}`, { singlePhase, threePhase });
    }
  }
  return Array.from(pairs.values());
}

export async function extractEmbeddedPdfImageRegions(sourcePath: string, pageNumber: number): Promise<EmbeddedPdfImageRegion[]> {
  try {
    const python = await resolvePythonBinary();
    const script = path.join(rootDir, "scripts", "pdf_image_regions.py");
    const { stdout } = await execFile(python, [script, sourcePath, String(pageNumber)], {
      encoding: "utf8",
      maxBuffer: 4 * 1024 * 1024,
      timeout: 45_000
    });
    const rows = JSON.parse(stdout) as unknown;
    if (!Array.isArray(rows)) return [];
    return rows
      .map((value) => {
        if (!value || typeof value !== "object") return null;
        const record = value as { index?: unknown; region?: Partial<CatalogImageRegion> };
        const region = record.region;
        if (!Number.isInteger(record.index) || !region) return null;
        if (![region.x, region.y, region.width, region.height].every((entry) => typeof entry === "number" && Number.isFinite(entry))) return null;
        return { index: Number(record.index), region: region as CatalogImageRegion };
      })
      .filter((value): value is EmbeddedPdfImageRegion => Boolean(value));
  } catch {
    return [];
  }
}

/**
 * Extract embedded images from a PDF page at their original quality using PyMuPDF.
 * Returns full image data (saved to disk) instead of just bounding boxes.
 * This produces dramatically better product photos than cropping from rendered pages.
 */
export async function extractEmbeddedPdfImages(jobId: string, sourcePath: string, pageNumber: number): Promise<ExtractedEmbeddedImage[]> {
  try {
    const python = await resolvePythonBinary();
    const script = path.join(rootDir, "scripts", "pdf_extract_images.py");
    const outputDir = path.join(privateImportDir, safeSegment(jobId), "embedded-images", `page-${String(pageNumber).padStart(4, "0")}`);
    await mkdir(outputDir, { recursive: true });
    const { stdout } = await execFile(python, [script, sourcePath, String(pageNumber), outputDir], {
      encoding: "utf8",
      maxBuffer: 32 * 1024 * 1024,
      timeout: 60_000
    });
    const rows = JSON.parse(stdout) as unknown;
    if (!Array.isArray(rows)) return [];
    return rows
      .map((value): ExtractedEmbeddedImage | null => {
        if (!value || typeof value !== "object") return null;
        const record = value as Partial<ExtractedEmbeddedImage>;
        if (typeof record.index !== "number" || !record.region) return null;
        const region = record.region;
        if (![region.x, region.y, region.width, region.height].every((entry) => typeof entry === "number" && Number.isFinite(entry))) return null;
        const result: ExtractedEmbeddedImage = {
          index: record.index,
          xref: record.xref ?? 0,
          duplicate: Boolean(record.duplicate),
          region: region as CatalogImageRegion,
          originalWidth: record.originalWidth ?? 0,
          originalHeight: record.originalHeight ?? 0,
          quality: record.quality ?? 0,
          ...(record.ext !== undefined ? { ext: record.ext } : {}),
          ...(record.colorSpace !== undefined ? { colorSpace: record.colorSpace } : {}),
          ...(record.bpc !== undefined ? { bpc: record.bpc } : {}),
          ...(record.sizeBytes !== undefined ? { sizeBytes: record.sizeBytes } : {}),
          ...(record.filePath !== undefined ? { filePath: record.filePath } : {})
        };
        return result;
      })
      .filter((value): value is ExtractedEmbeddedImage => value !== null && !value.duplicate && value.quality >= 25);
  } catch {
    return [];
  }
}

/**
 * Determine whether a PDF page should be skipped before sending to AI.
 * Saves API costs by filtering cover pages, indexes, and near-empty pages.
 */
export function shouldSkipPdfPage(pageText: string, pageNumber: number, totalPages: number): boolean {
  const textLength = pageText.replace(/\s+/g, "").length;
  // A textless page can be a full-page scan containing the entire catalog table.
  // It must reach the vision/OCR pipeline; empty text is not evidence of an empty page.
  if (textLength === 0) return false;
  // Almost entirely empty page with no numeric content
  if (textLength < 40 && !/\d{2,}/.test(pageText)) return true;
  // First 2 pages that are very short are likely covers/table of contents
  if (pageNumber <= 2 && textLength < 150 && !/\d{3,}/.test(pageText)) return true;
  // Confidentiality/rights notices can appear before the final back cover.
  if (/(?:her hakkı saklıdır|gizli ve özeldir|all rights reserved|confidential)/i.test(pageText) && !/\b(?:FSX?|FT)\s*[-_]?\s*\d{1,3}\b/i.test(pageText)) return true;
  // Last page with warranty/terms/conditions language
  if (pageNumber === totalPages && /(?:garanti|warranty|koşul|terms|conditions|notes|notlar)/i.test(pageText) && textLength < 400) return true;
  return false;
}

export async function extractPdfWordBoxes(sourcePath: string, pageNumber: number): Promise<PdfWordBox[]> {
  try {
    const python = await resolvePythonBinary();
    const script = path.join(rootDir, "scripts", "pdf_page_words.py");
    const { stdout } = await execFile(python, [script, sourcePath, String(pageNumber)], {
      encoding: "utf8",
      maxBuffer: 8 * 1024 * 1024,
      timeout: 45_000
    });
    const rows = JSON.parse(stdout) as unknown;
    if (!Array.isArray(rows)) return [];
    return rows
      .map((value) => {
        if (!value || typeof value !== "object") return null;
        const row = value as Partial<PdfWordBox>;
        if (typeof row.text !== "string" || ![row.x, row.y, row.width, row.height].every((entry) => typeof entry === "number" && Number.isFinite(entry))) return null;
        return row as PdfWordBox;
      })
      .filter((value): value is PdfWordBox => Boolean(value));
  } catch {
    return [];
  }
}

export async function cropCatalogProductImage(input: {
  jobId: string;
  pageNumber: number;
  productIndex: number;
  pageFilePath: string;
  region: CatalogImageRegion | null;
  embeddedImage?: ExtractedEmbeddedImage;
}): Promise<string> {
  if (!input.region || !isUsefulRegion(input.region)) return "";

  const relativeDir = path.join("uploads", "catalog-imports", safeSegment(input.jobId), "products");
  const outputDir = path.join(rootDir, "apps", "web", "public", relativeDir);
  await mkdir(outputDir, { recursive: true });
  const fileName = `p${String(input.pageNumber).padStart(4, "0")}-${String(input.productIndex + 1).padStart(3, "0")}-${randomUUID().slice(0, 8)}.webp`;
  const outputPath = path.join(outputDir, fileName);

  try {
    let sourceBuffer: Buffer;

    // Prefer original embedded image (much higher quality than render crop)
    if (input.embeddedImage?.filePath && existsSync(input.embeddedImage.filePath) && input.embeddedImage.quality >= 30) {
      sourceBuffer = await readFile(input.embeddedImage.filePath);
    } else {
      // Fallback: crop from rendered page
      const metadata = await sharp(input.pageFilePath).metadata();
      if (!metadata.width || !metadata.height) return "";

      const dpi = clamp(Number(process.env.CATALOG_PDF_RENDER_DPI) || 250, 110, 400);
      const inset = Math.max(2, Math.round(dpi * 0.02));
      const left = clamp(Math.floor((input.region.x / 1000) * metadata.width) + inset, 0, metadata.width - 1);
      const top = clamp(Math.floor((input.region.y / 1000) * metadata.height) + inset, 0, metadata.height - 1);
      const requestedWidth = Math.ceil((input.region.width / 1000) * metadata.width) - inset * 2;
      const requestedHeight = Math.ceil((input.region.height / 1000) * metadata.height) - inset * 2;
      const width = clamp(requestedWidth, 1, metadata.width - left);
      const height = clamp(requestedHeight, 1, metadata.height - top);
      if (width < 48 || height < 48) return "";

      sourceBuffer = await sharp(input.pageFilePath).extract({ left, top, width, height }).toBuffer();
    }

    const { buffer: output } = await normalizeProductImage(sourceBuffer);
    const stats = await sharp(output).stats();
    if (stats.entropy < 0.03) return "";
    await writeFile(outputPath, output);
  } catch {
    return "";
  }

  return `/${relativeDir.split(path.sep).join("/")}/${fileName}`;
}

export function privatePdfSourcePath(jobId: string): string {
  return path.join(privateImportDir, safeSegment(jobId), "source.pdf");
}

function isUsefulRegion(region: CatalogImageRegion): boolean {
  const area = region.width * region.height;
  return region.width >= 25 && region.height >= 25 && area >= 1_500 && area <= 850_000;
}

async function resolvePopplerBinary(name: "pdfinfo" | "pdftoppm" | "pdftotext"): Promise<string> {
  const envName = `${name.toUpperCase()}_BIN`;
  const configured = process.env[envName];
  const home = os.homedir();
  const candidates = [
    configured,
    path.join(home, ".cache", "codex-runtimes", "codex-primary-runtime", "dependencies", "bin", "override", name),
    path.join(home, ".cache", "codex-runtimes", "codex-primary-runtime", "dependencies", "native", "poppler", "poppler", "bin", name),
    `/opt/homebrew/bin/${name}`,
    `/usr/local/bin/${name}`,
    `/usr/bin/${name}`
  ].filter((candidate): candidate is string => Boolean(candidate));

  for (const candidate of candidates) {
    try {
      await access(candidate, constants.X_OK);
      return candidate;
    } catch {
      // Try the next known installation path.
    }
  }

  try {
    const { stdout } = await execFile("/usr/bin/env", ["which", name], { timeout: 5_000 });
    const resolved = stdout.trim();
    if (resolved) return resolved;
  } catch {
    // The actionable error below includes the missing binary name.
  }

  throw new Error(`${name} bulunamadı. PDF worker imajına Poppler kurulmalı veya ${envName} tanımlanmalı.`);
}

async function resolvePythonBinary(): Promise<string> {
  const home = os.homedir();
  const candidates = [
    process.env.CATALOG_PYTHON_BIN,
    path.join(home, ".cache", "codex-runtimes", "codex-primary-runtime", "dependencies", "python", "bin", "python3"),
    "/opt/homebrew/bin/python3",
    "/usr/local/bin/python3",
    "/usr/bin/python3"
  ].filter((candidate): candidate is string => Boolean(candidate));
  for (const candidate of candidates) {
    try {
      await access(candidate, constants.X_OK);
      return candidate;
    } catch {
      // Try the next runtime path.
    }
  }
  throw new Error("Python 3 bulunamadı.");
}

async function resolveTesseractBinary(): Promise<string | null> {
  const candidates = [
    process.env.TESSERACT_BIN,
    "/opt/homebrew/bin/tesseract",
    "/usr/local/bin/tesseract",
    "/usr/bin/tesseract"
  ].filter((candidate): candidate is string => Boolean(candidate));
  for (const candidate of candidates) {
    try {
      await access(candidate, constants.X_OK);
      return candidate;
    } catch {
      // OCR is optional locally; production workers should provide TESSERACT_BIN.
    }
  }
  try {
    const { stdout } = await execFile("/usr/bin/env", ["which", "tesseract"], { timeout: 5_000 });
    return stdout.trim() || null;
  } catch {
    return null;
  }
}

function sanitizeFileName(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[^A-Za-z0-9._ -]+/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 180);
}

function safeSegment(value: string): string {
  const segment = value.replace(/[^A-Za-z0-9_-]/g, "");
  if (!segment) throw new Error("Geçersiz import kimliği.");
  return segment;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function findWorkspaceRoot(startDir: string): string {
  let current = startDir;
  while (current !== path.dirname(current)) {
    if (existsSync(path.join(current, "pnpm-workspace.yaml")) || existsSync(path.join(current, "data", "catalog-store.json"))) return current;
    current = path.dirname(current);
  }
  return startDir;
}
