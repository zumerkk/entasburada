import { AlertTriangle, BarChart3, MessageCircle, PackageSearch, PhoneCall, SearchX, ShoppingCart } from "lucide-react";
import { MetricCard, StatusPill } from "@entas/ui";
import { requireAdmin } from "../../../lib/admin-auth";
import { getAbandonedCartsReport, getCustomerBehaviorReport, getProductInterestReport, getSearchMissesReport } from "../../../lib/analytics-repository";
import { AdminFrame } from "../AdminFrame";

export const dynamic = "force-dynamic";

export default async function AdminAnalyticsPage() {
  await requireAdmin();
  const [behaviorReport, productReport, abandonedReport, searchMissReport] = await Promise.all([
    getCustomerBehaviorReport(),
    getProductInterestReport(),
    getAbandonedCartsReport(),
    getSearchMissesReport()
  ]);

  return (
    <AdminFrame active="analytics">
      <header className="adminTopbar">
        <div>
          <span>Satış zekası</span>
          <h1>Müşteri davranışları ve sıcak fırsatlar</h1>
        </div>
        <div className="adminTopActions">
          <a className="btn btnGhost dark" href="/api/admin/analytics/customer-behavior">
            API verisi
          </a>
          <a className="btn btnPrimary" href="#abandoned-carts">
            <PhoneCall size={17} aria-hidden="true" />
            Aranacakları gör
          </a>
        </div>
      </header>

      <section className="metricGrid" aria-label="Satış zekası metrikleri">
        <MetricCard label="Event kaydı" value={behaviorReport.totals.eventCount.toLocaleString("tr-TR")} trend="Ürün, arama ve sepet sinyali" tone="info" />
        <MetricCard label="Aktif bayi" value={behaviorReport.totals.activeCustomerCount.toLocaleString("tr-TR")} trend="Davranış üreten hesap" tone="success" />
        <MetricCard label="Sıcak fırsat" value={behaviorReport.totals.hotOpportunityCount.toLocaleString("tr-TR")} trend="Arama veya sepet sinyali yüksek" tone="warning" />
        <MetricCard label="Sonuçsuz arama" value={searchMissReport.rows.length.toLocaleString("tr-TR")} trend="Yeni ürün/kategori fırsatı" tone="warning" />
      </section>

      <section className="adminGrid analyticsGrid">
        <div className="panel wide">
          <div className="panelHeader">
            <div>
              <h2>Müşteri davranışları</h2>
              <p>Hangi firma neye baktı, sepetinde ne kaldı ve temsilci hangi aksiyonu almalı.</p>
            </div>
            <BarChart3 size={22} aria-hidden="true" />
          </div>
          <div className="adminTable">
            <div className="adminTableHead behaviorRows">
              <span>Firma</span>
              <span>Segment</span>
              <span>En çok ürün/kategori</span>
              <span>Son ziyaret</span>
              <span>Sepet</span>
              <span>Aksiyon</span>
            </div>
            {behaviorReport.rows.map((row) => (
              <div className="adminTableRow behaviorRows" key={row.customerId}>
                <span>
                  <strong>{row.companyName}</strong>
                  <small>{row.userName} · {row.accountManager}</small>
                </span>
                <span>{row.segment}</span>
                <span>
                  <strong>{row.topProduct}</strong>
                  <small>{row.topCategory}</small>
                </span>
                <span>{formatDate(row.lastVisitAt)}</span>
                <span>
                  <strong>{row.abandonedCartTotal}</strong>
                  <small>{row.abandonedItemCount} satır</small>
                </span>
                <span>
                  <StatusPill tone={row.actionStatus === "Satış fırsatı" ? "warning" : "neutral"}>{row.actionStatus}</StatusPill>
                </span>
              </div>
            ))}
          </div>
          <div className="insightStack">
            {behaviorReport.rows.slice(0, 3).map((row) => (
              <div key={`${row.customerId}-summary`}>
                <strong>{row.companyName}</strong>
                <span>{row.aiSummary}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="panel" id="abandoned-carts">
          <div className="panelHeader compact">
            <h2>Terk edilmiş sepetler</h2>
            <ShoppingCart size={20} aria-hidden="true" />
          </div>
          <div className="opportunityList">
            {abandonedReport.rows.length > 0 ? (
              abandonedReport.rows.map((row) => (
                <div key={row.customerId}>
                  <strong>{row.companyName}</strong>
                  <span>
                    {row.itemCount} ürün · {row.cartTotal} · {row.ageLabel}
                  </span>
                  <small>{row.highestValueProduct}</small>
                  <div className="rowActions">
                    <a href={`tel:${row.phone}`}>
                      <PhoneCall size={14} aria-hidden="true" />
                      Ara
                    </a>
                    <a href={row.whatsappHref} target="_blank" rel="noreferrer">
                      <MessageCircle size={14} aria-hidden="true" />
                      WhatsApp
                    </a>
                  </div>
                </div>
              ))
            ) : (
              <p className="emptyInline">Açık sepet fırsatı yok.</p>
            )}
          </div>
        </div>

        <div className="panel wide">
          <div className="panelHeader">
            <div>
              <h2>Ürün ilgi raporu</h2>
              <p>Görüntüleme, sepete ekleme ve teklif niyetinden fırsat skoru hesaplanır.</p>
            </div>
            <PackageSearch size={22} aria-hidden="true" />
          </div>
          <div className="adminTable">
            <div className="adminTableHead productInterestRows">
              <span>Ürün</span>
              <span>İlgi</span>
              <span>Sepet/Teklif</span>
              <span>Stok</span>
              <span>Firmalar</span>
              <span>Skor</span>
            </div>
            {productReport.rows.slice(0, 18).map((row) => (
              <div className="adminTableRow productInterestRows" key={`${row.sku}-${row.productName}`}>
                <span>
                  <strong>{row.productName}</strong>
                  <small>{row.sku} · {row.brand} · {row.category}</small>
                </span>
                <span>
                  <strong>{row.viewCount}</strong>
                  <small>{row.uniqueCompanyCount} firma</small>
                </span>
                <span>
                  {row.cartAddCount} sepet · {row.quoteIntentCount} teklif
                  <small>Dönüşüm {row.conversionRate}</small>
                </span>
                <span>{row.stockStatus}</span>
                <span>{row.interestedCompanies.length ? row.interestedCompanies.join(", ") : "-"}</span>
                <span>
                  <StatusPill tone={row.opportunityScore >= 20 ? "warning" : "info"}>{row.opportunityScore}</StatusPill>
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="panel">
          <div className="panelHeader compact">
            <h2>Aranıp bulunamayanlar</h2>
            <SearchX size={20} aria-hidden="true" />
          </div>
          <div className="opportunityList">
            {searchMissReport.rows.length > 0 ? (
              searchMissReport.rows.map((row) => (
                <div key={row.term}>
                  <strong>{row.term}</strong>
                  <span>
                    {row.searchCount} arama · {row.companyCount} firma
                  </span>
                  <small>{row.suggestedCategory} · {row.purchaseOpportunity}</small>
                </div>
              ))
            ) : (
              <p className="emptyInline">Sonuçsuz arama yok.</p>
            )}
          </div>
        </div>

        <div className="panel">
          <div className="panelHeader compact">
            <h2>Temsilci önerileri</h2>
            <AlertTriangle size={20} aria-hidden="true" />
          </div>
          <ol className="priorityList">
            <li>Sepeti açık kalan bayiye aynı gün telefon aç.</li>
            <li>Sonuçsuz aramaları satın alma listesine ekle.</li>
            <li>Yüksek skor alan üründe muadil ve koli teklifini hazırla.</li>
            <li>Fiyatsız üründe temsilci fiyat teklifi oluştur.</li>
          </ol>
        </div>
      </section>
    </AdminFrame>
  );
}

function formatDate(value: string): string {
  if (!value) {
    return "-";
  }

  return new Intl.DateTimeFormat("tr-TR", {
    dateStyle: "short",
    timeStyle: "short"
  }).format(new Date(value));
}
