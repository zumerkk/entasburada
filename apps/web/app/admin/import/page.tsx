import { FileSpreadsheet, RotateCw, ShieldCheck, UploadCloud } from "lucide-react";
import { MetricCard, StatusPill } from "@entas/ui";
import { requireAdmin } from "../../../lib/admin-auth";
import { getCatalogOverview } from "../../../lib/catalog-repository";
import { publishAllDraftAction, syncAndPublishAction, syncImportAction } from "../actions";
import { AdminFrame } from "../AdminFrame";

export const dynamic = "force-dynamic";

export default async function AdminImportPage() {
  await requireAdmin();
  const { store, importReport, auditLogs } = await getCatalogOverview();
  const summary = store.importSummary;

  return (
    <AdminFrame active="import">
      <header className="adminTopbar">
        <div>
          <span>Import merkezi</span>
          <h1>XML senkronizasyon ve yayın akışı</h1>
        </div>
        <div className="adminTopActions">
          <form action={syncImportAction}>
            <button className="btn btnGhost dark" type="submit">
              <RotateCw size={17} aria-hidden="true" />
              Import'u Senkronize Et
            </button>
          </form>
          <form action={syncAndPublishAction}>
            <button className="btn btnPrimary" type="submit">
              <UploadCloud size={17} aria-hidden="true" />
              Senkronize Et ve Yayınla
            </button>
          </form>
        </div>
      </header>

      <section className="metricGrid" aria-label="Import metrikleri">
        <MetricCard label="Toplam katalog" value={summary.importedRows.toLocaleString("tr-TR")} trend="catalog-store.json" tone="info" />
        <MetricCard label="Yayında" value={summary.active.toLocaleString("tr-TR")} trend="public görünür" tone="success" />
        <MetricCard label="Taslak" value={summary.draft.toLocaleString("tr-TR")} trend="admin onayı bekler" tone="warning" />
        <MetricCard label="Fiyatsız" value={summary.zeroPrice.toLocaleString("tr-TR")} trend="temsilci teklifi" tone="warning" />
      </section>

      <section className="adminGrid">
        <div className="panel wide">
          <div className="panelHeader">
            <div>
              <h2>Tedarikçi kaynakları</h2>
              <p>Son import raporu ve satır durumları.</p>
            </div>
            <form action={publishAllDraftAction}>
              <button className="btn btnSecondary" type="submit">
                Tüm taslakları yayına al
              </button>
            </form>
          </div>
          <div className="adminTable">
            <div className="adminTableHead importRows">
              <span>Kaynak</span>
              <span>Satır</span>
              <span>Hata</span>
              <span>Durum</span>
            </div>
            {importReport?.sources.map((source) => (
              <div className="adminTableRow importRows" key={source.key}>
                <span>
                  <strong>{source.name}</strong>
                  <small>{source.path}</small>
                </span>
                <span>
                  {source.acceptedRows.toLocaleString("tr-TR")} / {source.totalRows.toLocaleString("tr-TR")}
                </span>
                <span>{source.issueCount.toLocaleString("tr-TR")}</span>
                <span>
                  <StatusPill tone={source.issueCount === 0 ? "success" : "danger"}>{source.issueCount === 0 ? "Tamamlandı" : "Kontrol"}</StatusPill>
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="panel">
          <div className="panelHeader compact">
            <h2>Görünürlük kuralı</h2>
            <ShieldCheck size={20} aria-hidden="true" />
          </div>
          <div className="behaviorList">
            <div>
              <strong>Import</strong>
              <span>Yeni ürün `DRAFT` gelir.</span>
            </div>
            <div>
              <strong>Admin onayı</strong>
              <span>Yayın aksiyonu ürünü `ACTIVE` yapar.</span>
            </div>
            <div>
              <strong>Public katalog</strong>
              <span>Sadece `ACTIVE` ve görünür ürünleri listeler.</span>
            </div>
          </div>
        </div>

        <div className="panel" id="audit">
          <div className="panelHeader compact">
            <h2>Audit log</h2>
            <FileSpreadsheet size={20} aria-hidden="true" />
          </div>
          <div className="auditList">
            {auditLogs.slice(0, 14).map((entry) => (
              <div key={entry.id}>
                <strong>{entry.action}</strong>
                <span>{entry.message}</span>
                <small>
                  {entry.actor} · {new Date(entry.timestamp).toLocaleString("tr-TR")}
                </small>
              </div>
            ))}
          </div>
        </div>
      </section>
    </AdminFrame>
  );
}
