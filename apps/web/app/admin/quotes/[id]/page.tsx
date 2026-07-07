import { notFound } from "next/navigation";
import { CheckCircle2, FileText, ShoppingCart, XCircle } from "lucide-react";
import { StatusPill } from "@entas/ui";
import { requireAdmin } from "../../../../lib/admin-auth";
import { getAdminQuoteById } from "../../../../lib/commercial-repository";
import { convertQuoteToOrderAction, priceQuoteAction, updateQuoteStatusAction } from "../../actions";
import { AdminFrame } from "../../AdminFrame";

export const dynamic = "force-dynamic";

export default async function AdminQuoteDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  const quote = await getAdminQuoteById(id);

  if (!quote) {
    notFound();
  }

  return (
    <AdminFrame active="quotes">
      <header className="adminTopbar">
        <div>
          <span>Teklif detayı</span>
          <h1>{quote.quoteNo}</h1>
        </div>
        <div className="adminTopActions">
          <a className="btn btnGhost dark" href={`/quote/${encodeURIComponent(quote.trackingCode)}`}>
            Müşteri Görünümü
          </a>
          <a className="btn btnGhost dark" href="/admin/quotes">
            Tekliflere dön
          </a>
        </div>
      </header>

      <section className="panel detailSummaryGrid">
        <div>
          <span>Firma</span>
          <strong>{quote.companyName}</strong>
        </div>
        <div>
          <span>Bayi</span>
          <strong>{quote.dealerName}</strong>
        </div>
        <div>
          <span>Durum</span>
          <StatusPill tone={quote.status === "APPROVED" || quote.status === "CONVERTED" ? "success" : quote.status === "REJECTED" ? "danger" : "info"}>
            {quote.status}
          </StatusPill>
        </div>
        <div>
          <span>Tutar</span>
          <strong>
            {quote.totalAmount} {quote.currency}
          </strong>
        </div>
        <div>
          <span>Satış temsilcisi</span>
          <strong>{quote.salesRepresentative}</strong>
        </div>
        <div>
          <span>Geçerlilik</span>
          <strong>{formatDate(quote.validUntil)}</strong>
        </div>
        <div>
          <span>Takip kodu</span>
          <strong>{quote.trackingCode}</strong>
        </div>
        <div>
          <span>İletişim</span>
          <strong>{quote.phone}</strong>
        </div>
      </section>

      <section className="panel">
        <div className="panelHeader">
          <div>
            <h2>Fiyatlandırma</h2>
            <p>Satır fiyatları kaydedildiğinde teklif müşteri onayına açılır.</p>
          </div>
          {quote.convertedOrderId ? (
            <a className="btn btnPrimary" href={`/admin/orders/${quote.convertedOrderId}`}>
              Siparişi aç
            </a>
          ) : null}
        </div>

        <form action={priceQuoteAction} className="quotePricingForm">
          <input type="hidden" name="quoteId" value={quote.id} />
          <div className="commercialTable">
            <div className="commercialTableHead adminQuoteItemRows">
              <span>Ürün</span>
              <span>Adet</span>
              <span>Hedef</span>
              <span>Liste</span>
              <span>Net teklif</span>
            </div>
            {quote.items.map((item) => (
              <div className="commercialTableRow adminQuoteItemRows" key={item.id}>
                <span>
                  <strong>{item.productName}</strong>
                  <small>
                    {item.sku} {item.brand ? `· ${item.brand}` : ""}
                  </small>
                </span>
                <span>
                  {item.quantity} {item.unit}
                </span>
                <span>{item.targetPrice ? `${item.targetPrice} ${item.currency}` : "-"}</span>
                <span>{item.catalogListPrice ? `${item.catalogListPrice} ${item.currency}` : "-"}</span>
                <label>
                  <input type="hidden" name="itemId" value={item.id} />
                  <input name={`price:${item.id}`} inputMode="decimal" defaultValue={item.quotedUnitPrice ?? item.targetPrice ?? item.catalogListPrice ?? ""} />
                </label>
              </div>
            ))}
          </div>
          <div className="adminFilterForm inlineCommercialForm">
            <label>
              Geçerlilik
              <input name="validUntil" type="date" defaultValue={toInputDate(quote.validUntil)} />
            </label>
            <label>
              Temsilci
              <input name="salesRepresentative" defaultValue={quote.salesRepresentative === "Atanmadi" ? "" : quote.salesRepresentative} />
            </label>
            <label className="spanTwo">
              İç not
              <textarea name="internalNote" defaultValue={quote.internalNote} />
            </label>
            <button className="btn btnPrimary" type="submit" disabled={quote.status === "CONVERTED" || quote.status === "REJECTED"}>
              <FileText size={17} aria-hidden="true" />
              Fiyatı Kaydet
            </button>
          </div>
        </form>
      </section>

      <section className="panel">
        <div className="panelHeader compact">
          <h2>Aksiyonlar</h2>
        </div>
        <div className="commercialActionRow">
          <form action={updateQuoteStatusAction}>
            <input type="hidden" name="quoteId" value={quote.id} />
            <input type="hidden" name="status" value="APPROVED" />
            <button className="btn btnSecondary" type="submit" disabled={quote.status === "CONVERTED" || quote.status === "REJECTED"}>
              <CheckCircle2 size={17} aria-hidden="true" />
              Onayla
            </button>
          </form>
          <form action={updateQuoteStatusAction}>
            <input type="hidden" name="quoteId" value={quote.id} />
            <input type="hidden" name="status" value="REJECTED" />
            <button className="btn btnGhost dark" type="submit" disabled={quote.status === "CONVERTED" || quote.status === "REJECTED"}>
              <XCircle size={17} aria-hidden="true" />
              Reddet
            </button>
          </form>
          <form action={convertQuoteToOrderAction}>
            <input type="hidden" name="quoteId" value={quote.id} />
            <button className="btn btnPrimary" type="submit" disabled={quote.convertedToOrder || quote.status === "REJECTED"}>
              <ShoppingCart size={17} aria-hidden="true" />
              Siparişe dönüştür
            </button>
          </form>
        </div>
      </section>

      <section className="panel">
        <div className="panelHeader compact">
          <h2>Hareket geçmişi</h2>
        </div>
        <div className="commercialTimeline">
          {quote.history.map((entry) => (
            <div key={entry.id}>
              <strong>{entry.message}</strong>
              <span>
                {entry.actorName} · {new Date(entry.at).toLocaleString("tr-TR")}
              </span>
            </div>
          ))}
        </div>
      </section>
    </AdminFrame>
  );
}

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "-" : date.toLocaleDateString("tr-TR");
}

function toInputDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10);
}
