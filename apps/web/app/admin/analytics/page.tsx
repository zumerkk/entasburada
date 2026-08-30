import { AlertTriangle, BarChart3, CircleDollarSign, Gauge, MessageCircle, PackageSearch, PhoneCall, SearchX, ShoppingCart, TrendingDown, UsersRound, WalletCards } from "lucide-react";
import { MetricCard, StatusPill } from "@entas/ui";
import { requireAdmin } from "../../../lib/admin-auth";
import { getAbandonedCartsReport, getCustomerBehaviorReport, getProductInterestReport, getSearchMissesReport } from "../../../lib/analytics-repository";
import { AdminFrame } from "../AdminFrame";
import { getManagementIntelligenceReport } from "../../../lib/business-intelligence";

export const dynamic = "force-dynamic";

export default async function AdminAnalyticsPage() {
  await requireAdmin();
  const [behaviorReport, productReport, abandonedReport, searchMissReport, management] = await Promise.all([
    getCustomerBehaviorReport(),
    getProductInterestReport(),
    getAbandonedCartsReport(),
    getSearchMissesReport(),
    getManagementIntelligenceReport()
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
        <MetricCard label="Teklif → sipariş" value={`%${management.funnel.quoteToOrderRate}`} trend={`${management.funnel.orderCount} sipariş / ${management.funnel.quoteCount} teklif`} tone="success" />
        <MetricCard label="Veri kalite puanı" value={`${management.quality.score}/100`} trend={`${management.quality.duplicateGroups} kopya grup`} tone={management.quality.score >= 80 ? "success" : "warning"} />
        <MetricCard label="Tahsilat riski" value={management.collectionRisks.length.toLocaleString("tr-TR")} trend="Borçlu veya limite yakın firma" tone="warning" />
        <MetricCard label="Yavaş stok" value={management.slowStock.length.toLocaleString("tr-TR")} trend="90+ gündür sipariş görmeyen" tone="warning" />
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
                  {row.suggestedProducts.length > 0 ? <span className="searchMissSuggestions">Otomatik muadil: {row.suggestedProducts.map((product) => <a href={product.href} key={product.href}>{product.label}</a>)}</span> : null}
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

        <div className="panel wide analyticsExecutivePanel">
          <div className="panelHeader"><div><h2>Satış dönüşüm hunisi</h2><p>Teklifin alınmasından teslimata kadar gerçek ticari kayıtlar.</p></div><Gauge size={22} /></div>
          <div className="funnelFlow">
            <div><span>Teklif</span><strong>{management.funnel.quoteCount}</strong></div>
            <div><span>Fiyatlandı</span><strong>{management.funnel.pricedCount}</strong></div>
            <div><span>Onaylandı</span><strong>{management.funnel.approvedCount}</strong></div>
            <div><span>Sipariş</span><strong>{management.funnel.orderCount}</strong></div>
            <div><span>Teslim</span><strong>{management.funnel.deliveredCount}</strong></div>
          </div>
        </div>

        <div className="panel wide">
          <div className="panelHeader"><div><h2>Müşteri satış hunisi ve kayıp riski</h2><p>Firma bazında teklif, sipariş, ciro, aktivite ve önerilen segment.</p></div><UsersRound size={22} /></div>
          <div className="adminTable">
            <div className="adminTableHead managementCustomerRows"><span>Firma</span><span>Teklif / Sipariş</span><span>Dönüşüm</span><span>Ciro</span><span>Risk</span><span>Önerilen segment</span></div>
            {management.customerFunnels.slice(0, 30).map((row) => <div className="adminTableRow managementCustomerRows" key={row.customerId}><span><strong>{row.companyName}</strong><small>{row.lastActivityAt ? formatDate(row.lastActivityAt) : "Aktivite yok"}</small></span><span>{row.quotes} / {row.orders}</span><span>%{row.conversionRate}</span><span>{formatTry(row.revenue)}</span><span><StatusPill tone={row.risk === "Yüksek kayıp riski" ? "danger" : row.risk === "Aktif" ? "success" : "warning"}>{row.risk}</StatusPill></span><span>{row.suggestedSegment}</span></div>)}
          </div>
        </div>

        <div className="panel">
          <div className="panelHeader compact"><h2>Tahsilat ve kredi riski</h2><WalletCards size={20} /></div>
          <div className="opportunityList">{management.collectionRisks.length ? management.collectionRisks.slice(0, 20).map((row) => <div key={row.customerId}><strong>{row.companyName}</strong><span>{formatTry(row.balance)} bakiye · {row.ageDays} gün</span><small>Kullanılabilir limit {formatTry(row.availableCredit)}</small><StatusPill tone={row.level === "Limit aşımı" ? "danger" : "warning"}>{row.level}</StatusPill></div>) : <p className="emptyInline">Tahsilat riski yok.</p>}</div>
        </div>

        <div className="panel">
          <div className="panelHeader compact"><h2>Kârlılık ve marj alarmları</h2><CircleDollarSign size={20} /></div>
          {management.margin.coveredProducts > 0 ? <div className="opportunityList">{management.margin.lowMarginProducts.map((row) => <div key={row.sku}><strong>{row.name}</strong><span>{row.sku} · %{row.marginRate} brüt marj</span><small>Maliyet {formatTry(row.costPrice)} · Satış {formatTry(row.salePrice)}</small></div>)}</div> : <div className="cartAlert warning"><span>Ürünlerde maliyet alanı bulunmuyor. Gerçek marj alarmı için ERP/import verisine “Maliyet” veya “Alış fiyatı” alanı eklenmeli.</span></div>}
          <small>{management.margin.missingCostProducts.toLocaleString("tr-TR")} üründe maliyet verisi eksik.</small>
        </div>

        <div className="panel wide">
          <div className="panelHeader"><div><h2>Yavaş hareket eden stok</h2><p>Stokta olup 90 günden uzun süredir sipariş görmeyen ürünler.</p></div><TrendingDown size={22} /></div>
          <div className="adminTable"><div className="adminTableHead slowStockRows"><span>Ürün</span><span>Marka</span><span>Stok</span><span>Son sipariş</span><span>Bekleme</span></div>{management.slowStock.slice(0, 24).map((row) => <div className="adminTableRow slowStockRows" key={row.sku}><span><strong>{row.name}</strong><small>{row.sku}</small></span><span>{row.brand}</span><span>{row.stockQuantity}</span><span>{row.lastOrderAt ? formatDate(row.lastOrderAt) : "Hiç sipariş yok"}</span><span><StatusPill tone="warning">{row.daysWithoutOrder >= 999 ? "Sipariş yok" : `${row.daysWithoutOrder} gün`}</StatusPill></span></div>)}</div>
        </div>

        <div className="panel wide">
          <div className="panelHeader"><div><h2>Satış temsilcisi performansı</h2><p>Atanan teklif, fiyatlama, sipariş dönüşümü ve ciro.</p></div><BarChart3 size={22} /></div>
          <div className="adminTable"><div className="adminTableHead repPerformanceRows"><span>Temsilci</span><span>Teklif</span><span>Fiyatlanan</span><span>Sipariş</span><span>Dönüşüm</span><span>Ciro</span></div>{management.representatives.map((row) => <div className="adminTableRow repPerformanceRows" key={row.name}><span><strong>{row.name}</strong></span><span>{row.quotes}</span><span>{row.priced}</span><span>{row.orders}</span><span>%{row.conversionRate}</span><span>{formatTry(row.revenue)}</span></div>)}</div>
        </div>

        <div className="panel">
          <div className="panelHeader compact"><h2>Ürün veri kalite puanı</h2><PackageSearch size={20} /></div>
          <div className="qualityScore"><strong>{management.quality.score}</strong><span>/ 100</span></div>
          <div className="alertList"><span>{management.quality.duplicateProducts} kopya ürün</span><span>{management.quality.wrongCategoryCandidates} kategori adayı</span><span>{management.quality.noImage} görsel sorunu</span><span>{management.quality.noPrice} fiyatsız ürün</span><span>{management.quality.placeholderBrands} yer tutucu marka</span><span>{management.quality.hotlinkedImages} dış görsel</span></div>
          <a className="btn btnGhost dark" href="/admin/data-quality">Detaylı veri kalitesini aç</a>
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

function formatTry(value: number): string {
  return new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY", maximumFractionDigits: 0 }).format(value);
}
