import { AlertTriangle, FileSpreadsheet, LockKeyhole, PackageSearch, ShieldCheck, Tags, Truck, UsersRound } from "lucide-react";
import { MetricCard, StatusPill } from "@entas/ui";
import { requireAdmin } from "../../lib/admin-auth";
import { getCatalogOverview } from "../../lib/catalog-repository";
import { loadCommercialStats } from "../../lib/commercial-repository";
import { AdminFrame } from "./AdminFrame";
import { AdminHashRedirect } from "./AdminHashRedirect";

export const dynamic = "force-dynamic";

export default async function AdminDashboardPage() {
  await requireAdmin();
  const [{ store, importReport, auditLogs }, commercialStats] = await Promise.all([getCatalogOverview(), loadCommercialStats()]);
  const summary = store.importSummary;

  return (
    <AdminFrame active="dashboard">
      <AdminHashRedirect />
      <header className="adminTopbar">
        <div>
          <span>Operasyon paneli</span>
          <h1>B2B ticaret kontrol merkezi</h1>
        </div>
        <div className="adminTopActions">
          <StatusPill tone="warning">Fiyatlar onaylı bayi kuralına bağlı</StatusPill>
          <a className="btn btnGhost dark" href="/catalog">
            Müşteri sitesini aç
          </a>
        </div>
      </header>

      <section className="metricGrid" aria-label="Ana metrikler">
        <MetricCard label="Yayındaki ürün" value={summary.active.toLocaleString("tr-TR")} trend="Public katalogda görünür" tone="success" />
        <MetricCard label="Taslak ürün" value={summary.draft.toLocaleString("tr-TR")} trend="Yayın bekleyen kayıt" tone="warning" />
        <MetricCard label="Teklif" value={commercialStats.quotes.toLocaleString("tr-TR")} trend={`${commercialStats.pendingQuotes.toLocaleString("tr-TR")} bekleyen`} tone="info" />
        <MetricCard label="Sipariş" value={commercialStats.orders.toLocaleString("tr-TR")} trend={`${commercialStats.openOrders.toLocaleString("tr-TR")} açık operasyon`} tone="info" />
      </section>

      <section className="adminGrid">
        <div className="panel wide">
          <div className="panelHeader">
            <div>
              <h2>Ürün yayın durumu</h2>
              <p>Import edilen ürünler admin onayıyla public katalogda görünür.</p>
            </div>
            <a className="btn btnPrimary" href="/admin/products">
              <PackageSearch size={17} aria-hidden="true" />
              Ürünleri Yönet
            </a>
          </div>
          <div className="adminInfoGrid">
            <div>
              <ShieldCheck size={20} aria-hidden="true" />
              <strong>Public güvenlik</strong>
              <span>Public ürün DTO'su fiyat ve gerçek stok miktarı taşımaz.</span>
            </div>
            <div>
              <LockKeyhole size={20} aria-hidden="true" />
              <strong>Admin API</strong>
              <span>`/api/admin/products` cookie yoksa 401 döner.</span>
            </div>
            <div>
              <Truck size={20} aria-hidden="true" />
              <strong>Stok görünümü</strong>
              <span>Müşteri sadece Stokta, Az stok veya Stok yok bilgisini görür.</span>
            </div>
          </div>
        </div>

        <div className="panel">
          <div className="panelHeader compact">
            <h2>Import özeti</h2>
            <FileSpreadsheet size={20} aria-hidden="true" />
          </div>
          <div className="jobList">
            {importReport?.sources.map((source) => (
              <div className="jobItem" key={source.key}>
                <strong>{source.name}</strong>
                <span>{source.issueCount === 0 ? "Tamamlandı" : "Hata var"}</span>
                <small>
                  {source.acceptedRows.toLocaleString("tr-TR")} / {source.totalRows.toLocaleString("tr-TR")} satır
                </small>
              </div>
            ))}
          </div>
        </div>

        <div className="panel" id="pricing">
          <div className="panelHeader compact">
            <h2>Fiyat katmanı</h2>
            <Tags size={20} aria-hidden="true" />
          </div>
          <ol className="priorityList">
            <li>Onaysız ziyaretçi: fiyat kapalı</li>
            <li>Onaylı bayi: fiyat motoru kuralı</li>
            <li>Sıfır fiyatlı ürün: temsilci teklifi</li>
            <li>Admin: liste fiyatı ve gerçek stok görünür</li>
          </ol>
        </div>

        <div className="panel" id="stock">
          <div className="panelHeader compact">
            <h2>Stok riskleri</h2>
            <AlertTriangle size={20} aria-hidden="true" />
          </div>
          <div className="alertList">
            <span>Stokta: {summary.inStock.toLocaleString("tr-TR")}</span>
            <span>Az stok: {summary.lowStock.toLocaleString("tr-TR")}</span>
            <span>Stok yok: {summary.outOfStock.toLocaleString("tr-TR")}</span>
          </div>
        </div>

        <div className="panel" id="dealers">
          <div className="panelHeader compact">
            <h2>Bayi modülü</h2>
            <UsersRound size={20} aria-hidden="true" />
          </div>
          <div className="behaviorList">
            <div>
              <strong>Giriş</strong>
              <span>Bayi girişi public tarafta ayrı akış olarak tutulur.</span>
            </div>
            <div>
              <strong>Başvuru</strong>
              <span>Bayi başvuru formu müşteri sitesinde hazırdır.</span>
            </div>
          </div>
        </div>

        <div className="panel" id="quotes">
          <div className="panelHeader compact">
            <h2>Teklifler</h2>
            <a className="textLink" href="/admin/quotes">
              Teklif ekranı
            </a>
          </div>
          <div className="behaviorList">
            <div>
              <strong>{commercialStats.quotes.toLocaleString("tr-TR")} teklif</strong>
              <span>Müşteri talepleri canlı kayıt oluşturur; fiyatlanıp siparişe dönüşür.</span>
            </div>
          </div>
        </div>

        <div className="panel" id="orders">
          <div className="panelHeader compact">
            <h2>Siparişler</h2>
            <a className="textLink" href="/admin/orders">
              Sipariş ekranı
            </a>
          </div>
          <div className="behaviorList">
            <div>
              <strong>{commercialStats.orders.toLocaleString("tr-TR")} sipariş</strong>
              <span>Teklif onayı veya admin dönüşümüyle sipariş operasyon akışı başlar.</span>
            </div>
          </div>
        </div>

        <div className="panel">
          <div className="panelHeader compact">
            <h2>Son audit</h2>
            <ShieldCheck size={20} aria-hidden="true" />
          </div>
          <div className="auditList">
            {auditLogs.slice(0, 5).map((entry) => (
              <div key={entry.id}>
                <strong>{entry.action}</strong>
                <span>{entry.message}</span>
                <small>{new Date(entry.timestamp).toLocaleString("tr-TR")}</small>
              </div>
            ))}
          </div>
        </div>
      </section>
    </AdminFrame>
  );
}
