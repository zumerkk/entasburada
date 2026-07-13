import { BrainCircuit, CheckCircle2, FileCode2, FileText, PlayCircle, ShieldAlert, UploadCloud, XCircle } from "lucide-react";
import { MetricCard, StatusPill } from "@entas/ui";
import { requireAdmin } from "../../../lib/admin-auth";
import { loadImportJobs } from "../../../lib/smart-import-repository";
import { AdminFrame } from "../AdminFrame";
import { approveSmartImportAction, createXmlSmartImportAction, processPdfSmartImportAction, rejectSmartImportAction } from "./actions";
import { PdfCatalogImporter } from "./PdfCatalogImporter";

export const dynamic = "force-dynamic";

export default async function AdminAiImportPage() {
  await requireAdmin();
  const jobs = await loadImportJobs();
  const latestJob = jobs[0] ?? null;
  const qualityIssueCount = jobs.reduce((sum, job) => sum + job.qualityIssues.length, 0);
  const approvedCount = jobs.filter((job) => job.status === "approved").length;

  return (
    <AdminFrame active="ai-import">
      <header className="adminTopbar">
        <div>
          <span>Akıllı ürün aktarım merkezi</span>
          <h1>XML, PDF ve dijital katalog önizleme/onay akışı</h1>
        </div>
        <div className="adminTopActions">
          <a className="btn btnGhost dark" href="/api/admin/import/sources">
            Kaynak API
          </a>
          <a className="btn btnPrimary" href="#new-import">
            <UploadCloud size={17} aria-hidden="true" />
            Yeni aktarım
          </a>
        </div>
      </header>

      <section className="metricGrid" aria-label="Akıllı import metrikleri">
        <MetricCard label="Import job" value={jobs.length.toLocaleString("tr-TR")} trend="XML/PDF önizleme kayıtları" tone="info" />
        <MetricCard label="Onaylanan job" value={approvedCount.toLocaleString("tr-TR")} trend="Kataloğa taslak aktarıldı" tone="success" />
        <MetricCard label="Kalite sorunu" value={qualityIssueCount.toLocaleString("tr-TR")} trend="Admin kontrolü bekler" tone="warning" />
        <MetricCard label="Son job ürünü" value={(latestJob?.extractedProducts.length ?? 0).toLocaleString("tr-TR")} trend={latestJob?.sourceName ?? "Henüz job yok"} tone="info" />
      </section>

      <section className="adminGrid aiImportGrid">
        <div className="panel wide" id="new-import">
          <div className="panelHeader">
            <div>
              <h2>Yeni katalog kaynağı</h2>
              <p>XML kaynakları doğrudan ayrıştırılır; PDF kataloglar sayfa görüntüsü, metin katmanı ve ürün koordinatlarıyla işlenir.</p>
            </div>
            <BrainCircuit size={24} aria-hidden="true" />
          </div>
          <div className="importSourceGrid">
            <form className="adminSettingsForm" action={createXmlSmartImportAction}>
              <div className="miniPanelTitle">
                <FileCode2 size={18} aria-hidden="true" />
                <strong>XML import</strong>
              </div>
              <label>
                Kaynak adı
                <input name="sourceName" placeholder="Mirsan EFIYAT / EuroMix / tedarikçi adı" />
              </label>
              <label>
                XML URL
                <input name="xmlUrl" placeholder="https://..." />
              </label>
              <label>
                XML dosyası
                <input name="xmlFile" type="file" accept=".xml,text/xml,application/xml" />
              </label>
              <label>
                XML metni
                <textarea name="xmlText" placeholder="<urunler>..." />
              </label>
              <button className="btn btnPrimary" type="submit">
                <UploadCloud size={17} aria-hidden="true" />
                XML Önizleme Oluştur
              </button>
            </form>

            <PdfCatalogImporter />
          </div>
        </div>

        <div className="panel">
          <div className="panelHeader compact">
            <h2>Kalite merkezi</h2>
            <ShieldAlert size={20} aria-hidden="true" />
          </div>
          <div className="opportunityList">
            {jobs.flatMap((job) => job.qualityIssues.slice(0, 3).map((issue) => ({ job, issue }))).slice(0, 10).map(({ job, issue }) => (
              <div key={issue.id}>
                <strong>{issue.field}</strong>
                <span>{issue.message}</span>
                <small>{job.sourceName} · {issue.severity}</small>
              </div>
            ))}
            {qualityIssueCount === 0 ? <p className="emptyInline">Açık kalite sorunu yok.</p> : null}
          </div>
        </div>

        <div className="panel wide">
          <div className="panelHeader">
            <div>
              <h2>Import jobları</h2>
              <p>Hiçbir kaynak admin onayı olmadan public katalogda yayına alınmaz.</p>
            </div>
            <StatusPill tone="warning">Admin onaylı akış</StatusPill>
          </div>
          <div className="adminTable">
            <div className="adminTableHead importJobRows">
              <span>Kaynak</span>
              <span>Tip</span>
              <span>Ürün</span>
              <span>Kalite</span>
              <span>Durum</span>
              <span>Aksiyon</span>
            </div>
            {jobs.map((job) => (
              <div className="adminTableRow importJobRows" key={job.id}>
                <span>
                  <strong>{job.sourceName}</strong>
                  <small>
                    {job.fileName} · {formatDate(job.createdAt)}
                    {job.pdfProgress ? ` · ${job.pdfProgress.percent}%` : ""}
                  </small>
                </span>
                <span>{job.type.toLocaleUpperCase("tr-TR")}</span>
                <span>
                  <strong>{job.extractedProducts.length.toLocaleString("tr-TR")}</strong>
                  <small>{job.acceptedRecords.toLocaleString("tr-TR")} kabul</small>
                </span>
                <span>{job.qualityIssues.length.toLocaleString("tr-TR")}</span>
                <span>
                  <StatusPill tone={job.status === "approved" ? "success" : job.status === "rejected" || job.status === "failed" ? "danger" : job.status === "needs_review" ? "warning" : "info"}>{job.status}</StatusPill>
                </span>
                <span className="rowActions">
                  <a href={`/admin/ai-import/${job.id}`}>İncele</a>
                  <form action={approveSmartImportAction}>
                    <input type="hidden" name="jobId" value={job.id} />
                    <button type="submit" disabled={job.status === "approved" || job.status === "queued" || job.status === "processing" || job.extractedProducts.length === 0}>
                      <CheckCircle2 size={14} aria-hidden="true" />
                      Onayla
                    </button>
                  </form>
                  {job.type === "pdf" && (job.status === "queued" || job.status === "processing") ? (
                    <form action={processPdfSmartImportAction}>
                      <input type="hidden" name="jobId" value={job.id} />
                      <button type="submit">
                        <PlayCircle size={14} aria-hidden="true" />
                        Devam
                      </button>
                    </form>
                  ) : null}
                  <form action={rejectSmartImportAction}>
                    <input type="hidden" name="jobId" value={job.id} />
                    <button type="submit" disabled={job.status === "rejected"}>
                      <XCircle size={14} aria-hidden="true" />
                      Reddet
                    </button>
                  </form>
                </span>
              </div>
            ))}
          </div>
        </div>

        {latestJob ? (
          <div className="panel wide">
            <div className="panelHeader compact">
              <h2>Son önizleme</h2>
              <FileText size={20} aria-hidden="true" />
            </div>
            <div className="latestImportProducts">
              {latestJob.extractedProducts.slice(0, 8).map((product) => (
                <div className="latestImportProduct" key={product.id}>
                  <div className="latestImportThumb">{product.imageUrl ? <img src={product.imageUrl} alt="" /> : <FileText size={20} aria-hidden="true" />}</div>
                  <div>
                    <strong>{product.productName || "Ürün adı bekliyor"}</strong>
                    <span>{product.sku} · {product.brandName} · {product.categoryName}</span>
                    <small>{product.listPrice} {product.currency} · Güven {product.confidenceScore} · s.{product.sourcePage ?? "-"}</small>
                  </div>
                </div>
              ))}
              {latestJob.extractedProducts.length === 0 ? <p className="emptyInline">Bu job için ürün adayı çıkarılamadı.</p> : null}
            </div>
          </div>
        ) : null}
      </section>
    </AdminFrame>
  );
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("tr-TR", {
    dateStyle: "short",
    timeStyle: "short"
  }).format(new Date(value));
}
