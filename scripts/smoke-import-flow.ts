import { readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { loadEnvFile } from "node:process";
import { fileURLToPath } from "node:url";

interface ImportJobResponse {
  job: {
    id: string;
    type: string;
    status: string;
    totalRecords: number;
    acceptedRecords: number;
  };
}

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
loadLocalWebEnv();
const baseUrl = process.env.ENTAS_BASE_URL ?? "http://localhost:3000";
const adminCookie = `entas_admin_session=${encodeURIComponent(process.env.ADMIN_SESSION_SECRET ?? "dev-admin-session")}`;
const mutableFiles = ["data/ai-import-jobs.json", "data/catalog-store.json", "data/audit-log.json"];

async function main(): Promise<void> {
  const backups = await backupMutableFiles();
  const runId = Date.now();
  const sku = `SMOKE-IMPORT-${runId}`;
  let pdfJobId = "";

  try {
    const unauthorized = await requestJson<{ error: string }>("/api/admin/import/sources", { expectedStatus: 401 });
    assert(unauthorized.error === "Unauthorized", "Import kaynaklari cookie olmadan 401 donmeli.");

    const blockedInternalUrl = await requestJson<{ error: string }>("/api/admin/import/xml", {
      method: "POST",
      expectedStatus: 400,
      authenticated: true,
      body: { url: "http://127.0.0.1:3000/api/health", sourceName: "SSRF smoke" }
    });
    assert(
      blockedInternalUrl.error.includes("ozel ag") ||
        blockedInternalUrl.error.includes("Yerel") ||
        blockedInternalUrl.error.includes("izin listesinde degil"),
      "Yerel XML URL engellenmeli."
    );

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urunler>
  <urun>
    <id>${sku}</id>
    <kod>${sku}</kod>
    <isim>SMOKE IMPORT TEST URUNU</isim>
    <marka>SMOKE BRAND</marka>
    <kategori>Test Kategorisi</kategori>
    <fiyat>125.50</fiyat>
    <doviz>TRY</doviz>
    <birim>Adet</birim>
    <miktar>12</miktar>
    <resim>https://example.com/smoke-product.jpg</resim>
  </urun>
</urunler>`;

    const created = await requestJson<ImportJobResponse>("/api/admin/import/xml", {
      method: "POST",
      expectedStatus: 201,
      authenticated: true,
      body: { xml, sourceName: "Import Smoke Test" }
    });
    assert(created.job.type === "xml", "XML import job tipi xml olmali.");
    assert(created.job.totalRecords === 1 && created.job.acceptedRecords === 1, "XML import bir urun cikarmali.");

    const preview = await requestJson<ImportJobResponse>("/api/admin/import/preview", {
      method: "POST",
      authenticated: true,
      body: { jobId: created.job.id }
    });
    assert(preview.job.id === created.job.id, "Import preview ayni job kaydini dondurmeli.");

    const exportedXml = await requestText("/api/admin/import/export-xml", {
      method: "POST",
      authenticated: true,
      body: { jobId: created.job.id }
    });
    assert(exportedXml.includes(sku), "XML export smoke SKU bilgisini icermeli.");

    const approved = await requestJson<{ job: { status: string }; importedCount: number }>("/api/admin/import/approve", {
      method: "POST",
      authenticated: true,
      body: { jobId: created.job.id }
    });
    assert(approved.job.status === "approved" && approved.importedCount === 1, "XML job bir taslak urun olarak onaylanmali.");

    const pdfForm = new FormData();
    pdfForm.append("file", new File([createMinimalPdf("SMOKE PDF PRODUCT 250.00 TRY")], "smoke-catalog.pdf", { type: "application/pdf" }));
    const pdf = await requestJson<ImportJobResponse>("/api/admin/import/pdf", {
      method: "POST",
      expectedStatus: 201,
      authenticated: true,
      body: pdfForm
    });
    pdfJobId = pdf.job.id;
    assert(pdf.job.type === "pdf" && pdf.job.status === "queued", "PDF job sayfa analiz kuyruguna alinmali.");

    const sources = await requestJson<{ jobs: Array<{ id: string }> }>("/api/admin/import/sources", { authenticated: true });
    assert(sources.jobs.some((job) => job.id === created.job.id), "Import kaynak listesi yeni XML jobunu gostermeli.");

    console.log(
      JSON.stringify(
        {
          ok: true,
          xml: { status: approved.job.status, importedCount: approved.importedCount },
          pdf: { status: pdf.job.status, acceptedRecords: pdf.job.acceptedRecords },
          networkSafety: "private_url_blocked"
        },
        null,
        2
      )
    );
  } finally {
    await restoreMutableFiles(backups);
    if (pdfJobId) {
      await rm(path.join(rootDir, "data", "catalog-imports", pdfJobId), { recursive: true, force: true });
      await rm(path.join(rootDir, "apps", "web", "public", "uploads", "catalog-imports", pdfJobId), { recursive: true, force: true });
    }
  }
}

function createMinimalPdf(text: string): string {
  const escaped = text.replace(/[()\\]/g, (character) => `\\${character}`);
  const stream = `BT /F1 18 Tf 60 760 Td (${escaped}) Tj ET`;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
    `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"
  ];
  let document = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(document));
    document += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xrefOffset = Buffer.byteLength(document);
  document += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  document += offsets.slice(1).map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`).join("");
  document += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return document;
}

async function requestJson<T>(
  route: string,
  options: { authenticated?: boolean; body?: unknown | FormData; expectedStatus?: number; method?: "GET" | "POST" } = {}
): Promise<T> {
  const response = await makeRequest(route, options);
  const text = await response.text();
  const expectedStatus = options.expectedStatus ?? 200;
  assert(response.status === expectedStatus, `${route} ${expectedStatus} donmeli; gelen ${response.status}: ${text}`);
  return text ? (JSON.parse(text) as T) : ({} as T);
}

async function requestText(
  route: string,
  options: { authenticated?: boolean; body?: unknown | FormData; expectedStatus?: number; method?: "GET" | "POST" } = {}
): Promise<string> {
  const response = await makeRequest(route, options);
  const text = await response.text();
  const expectedStatus = options.expectedStatus ?? 200;
  assert(response.status === expectedStatus, `${route} ${expectedStatus} donmeli; gelen ${response.status}: ${text}`);
  return text;
}

function makeRequest(
  route: string,
  options: { authenticated?: boolean; body?: unknown | FormData; method?: "GET" | "POST" }
): Promise<Response> {
  const isForm = options.body instanceof FormData;
  return fetch(`${baseUrl}${route}`, {
    method: options.method ?? (options.body ? "POST" : "GET"),
    headers: {
      ...(options.authenticated ? { Cookie: adminCookie } : {}),
      ...(!isForm && options.body ? { "Content-Type": "application/json" } : {})
    },
    body: isForm ? options.body : options.body ? JSON.stringify(options.body) : undefined
  });
}

function loadLocalWebEnv(): void {
  try {
    loadEnvFile(path.join(rootDir, "apps", "web", ".env.local"));
  } catch (error) {
    const code = typeof error === "object" && error !== null && "code" in error ? String(error.code) : "";
    if (code !== "ENOENT") throw error;
  }
}

async function backupMutableFiles(): Promise<Map<string, string>> {
  const backups = new Map<string, string>();
  for (const file of mutableFiles) backups.set(file, await readText(file, "[]\n"));
  return backups;
}

async function restoreMutableFiles(backups: Map<string, string>): Promise<void> {
  for (const [file, content] of backups) await writeFile(path.join(rootDir, file), content);
}

async function readText(relativePath: string, fallback: string): Promise<string> {
  try {
    return await readFile(path.join(rootDir, relativePath), "utf8");
  } catch (error) {
    const code = typeof error === "object" && error !== null && "code" in error ? String(error.code) : "";
    if (code === "ENOENT") return fallback;
    throw error;
  }
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
