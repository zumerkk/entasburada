import { AlertTriangle, CheckCircle2, FileSpreadsheet, RotateCw, UploadCloud } from "lucide-react";
import { MetricCard, StatusPill } from "@entas/ui";
import { requireAdmin } from "../../../lib/admin-auth";
import { getIntegrationHealth } from "../../../lib/integration-monitor";
import { syncAndPublishAction, syncImportAction } from "../actions";
import { AdminFrame } from "../AdminFrame";

export const dynamic = "force-dynamic";

export default async function AdminIntegrationsPage() {
  await requireAdmin();
  const health = await getIntegrationHealth();

  return (
    <AdminFrame active="integrations">
      <header className="adminTopbar">
        <div>
          <span>XML entegrasyon izleme</span>
          <h1>Tedarikçi veri sağlığı</h1>
        </div>
        <div className="adminTopActions">
          <form action={syncImportAction}>
            <button className="btn btnGhost dark" type="submit">
              <RotateCw size={17} aria-hidden="true" />
              Senkronize Et
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

      <section className="metricGrid">
        <MetricCard label="Toplam satır" value={health.totalProducts.toLocaleString("tr-TR")} trend={`Son import: ${formatDateTime(health.generatedAt)}`} tone="info" />
        <MetricCard label="Yayındaki ürün" value={health.activeProducts.toLocaleString("tr-TR")} trend="Public katalog" tone="success" />
        <MetricCard label="Fiyatsız satır" value={health.zeroPriceRows.toLocaleString("tr-TR")} trend="Teklif gerektirir" tone="warning" />
        <MetricCard label="Fiyat değişimi" value={health.pendingPriceChanges.toLocaleString("tr-TR")} trend={`${health.pendingStockChanges.toLocaleString("tr-TR")} stok değişimi`} tone={health.pendingPriceChanges > 0 || health.pendingStockChanges > 0 ? "warning" : "success"} />
        <MetricCard label="Yeni ürün" value={health.pendingNewProducts.toLocaleString("tr-TR")} trend={`Mükerrer SKU: ${health.duplicateSkuCount}`} tone={health.pendingNewProducts > 0 ? "warning" : "success"} />
      </section>

      <section className="panel">
        <div className="panelHeader">
          <div>
            <h2>Kaynak sağlık listesi</h2>
            <p>XML kaynakları import raporu ve katalog store üzerinden izlenir.</p>
          </div>
          <StatusPill tone={health.sources.every((source) => source.status === "ok") ? "success" : "warning"}>
            {health.sources.every((source) => source.status === "ok") ? "Tüm kaynaklar sağlıklı" : "Kontrol gereken kaynak var"}
          </StatusPill>
        </div>
        <div className="adminTable">
          <div className="adminTableHead integrationRows">
            <span>Kaynak</span>
            <span>Satır</span>
            <span>Aktif</span>
              <span>Fiyat / Stok</span>
              <span>Değişim</span>
              <span>Dosya</span>
              <span>Durum</span>
          </div>
          {health.sources.map((source) => (
            <div className="adminTableRow integrationRows" key={source.key}>
              <span>
                <strong>{source.name}</strong>
                <small>{source.url ?? source.path}</small>
              </span>
              <span>
                {source.acceptedRows.toLocaleString("tr-TR")} / {source.totalRows.toLocaleString("tr-TR")}
                <small>{source.issueCount.toLocaleString("tr-TR")} hata</small>
              </span>
              <span>{source.activeProducts.toLocaleString("tr-TR")}</span>
              <span>
                <strong>{source.zeroPriceProducts.toLocaleString("tr-TR")} fiyatsız</strong>
                <small>{source.outOfStockProducts.toLocaleString("tr-TR")} stok yok</small>
              </span>
              <span>
                <strong>{source.pendingPriceChanges.toLocaleString("tr-TR")} fiyat</strong>
                <small>
                  {source.pendingStockChanges.toLocaleString("tr-TR")} stok · {source.pendingNewProducts.toLocaleString("tr-TR")} yeni
                </small>
              </span>
              <span>
                <strong>{source.path}</strong>
                <small>{source.fileUpdatedAt ? formatDateTime(source.fileUpdatedAt) : "Dosya yok"}</small>
              </span>
              <span>
                <StatusPill tone={source.status === "ok" ? "success" : source.status === "warning" ? "warning" : "danger"}>
                  {source.status === "ok" ? <CheckCircle2 size={13} aria-hidden="true" /> : <AlertTriangle size={13} aria-hidden="true" />}
                  {source.statusLabel}
                </StatusPill>
              </span>
            </div>
          ))}
        </div>
      </section>

      <section className="panel">
        <div className="panelHeader compact">
          <h2>Stok dağılımı</h2>
          <FileSpreadsheet size={20} aria-hidden="true" />
        </div>
        <div className="alertList">
          <span>Stokta: {health.inStock.toLocaleString("tr-TR")}</span>
          <span>Az stok: {health.lowStock.toLocaleString("tr-TR")}</span>
          <span>Stok yok: {health.outOfStock.toLocaleString("tr-TR")}</span>
        </div>
      </section>
    </AdminFrame>
  );
}

function formatDateTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "-" : date.toLocaleString("tr-TR");
}
