import { notFound } from "next/navigation";
import { CheckCircle2, XCircle } from "lucide-react";
import { StatusPill } from "@entas/ui";
import { getAdminOrderById, getQuoteByTrackingCode } from "../../../lib/commercial-repository";
import { approveQuoteByTrackingCodeAction, rejectQuoteByTrackingCodeAction } from "../actions";

type SearchParams = Record<string, string | string[] | undefined>;

export const dynamic = "force-dynamic";

export default async function QuoteTrackingPage({ params, searchParams }: { params: Promise<{ code: string }>; searchParams: Promise<SearchParams> }) {
  const { code } = await params;
  const query = await searchParams;
  const quote = await getQuoteByTrackingCode(code);
  const error = getParam(query, "error");

  if (!quote) {
    notFound();
  }

  const order = quote.convertedOrderId ? await getAdminOrderById(quote.convertedOrderId) : null;
  const canApprove = quote.status === "PRICED" || quote.status === "APPROVED";
  const canReject = quote.status === "PRICED" || quote.status === "SUBMITTED" || quote.status === "ASSIGNED";

  return (
    <main>
      <section className="shell pageIntro">
        <div>
          <span className="eyebrow dark">Teklif takibi</span>
          <h1>{quote.quoteNo}</h1>
          <p>{quote.companyName} için oluşturulan teklif talebi.</p>
        </div>
      </section>

      <section className="shell trackingGrid">
        <article className="panel trackingDetail">
          {error ? <div className="formError">{error}</div> : null}
          <div className="detailSummaryGrid">
            <div>
              <span>Takip kodu</span>
              <strong>{quote.trackingCode}</strong>
            </div>
            <div>
              <span>Durum</span>
              <StatusPill tone={quote.status === "REJECTED" ? "danger" : quote.status === "CONVERTED" ? "success" : "info"}>{quote.status}</StatusPill>
            </div>
            <div>
              <span>Firma</span>
              <strong>{quote.companyName}</strong>
            </div>
            <div>
              <span>Yetkili</span>
              <strong>{quote.authorizedPerson}</strong>
            </div>
            <div>
              <span>Toplam</span>
              <strong>
                {quote.totalAmount} {quote.currency}
              </strong>
            </div>
            <div>
              <span>Geçerlilik</span>
              <strong>{formatDate(quote.validUntil)}</strong>
            </div>
          </div>

          <div className="commercialTable">
            <div className="commercialTableHead quoteItemRows">
              <span>Ürün</span>
              <span>Adet</span>
              <span>Hedef</span>
              <span>Teklif</span>
            </div>
            {quote.items.map((item) => (
              <div className="commercialTableRow quoteItemRows" key={item.id}>
                <span>
                  <strong>{item.productName}</strong>
                  <small>{item.sku}</small>
                </span>
                <span>
                  {item.quantity} {item.unit}
                </span>
                <span>{item.targetPrice ? `${item.targetPrice} ${item.currency}` : "-"}</span>
                <span>{item.quotedUnitPrice ? `${item.quotedUnitPrice} ${item.currency}` : "Fiyat bekleniyor"}</span>
              </div>
            ))}
          </div>

          {order ? (
            <div className="trackingNotice success">
              <strong>Sipariş oluşturuldu</strong>
              <a className="btn btnPrimary" href={`/orders/${encodeURIComponent(order.trackingCode)}`}>
                {order.orderNo} siparişini takip et
              </a>
            </div>
          ) : canApprove || canReject ? (
            <div className="trackingActions">
              {canApprove ? (
                <form action={approveQuoteByTrackingCodeAction}>
                  <input type="hidden" name="trackingCode" value={quote.trackingCode} />
                  <button className="btn btnPrimary" type="submit">
                    <CheckCircle2 size={17} aria-hidden="true" />
                    Teklifi Onayla ve Siparişe Çevir
                  </button>
                </form>
              ) : null}
              {canReject ? (
                <form action={rejectQuoteByTrackingCodeAction}>
                  <input type="hidden" name="trackingCode" value={quote.trackingCode} />
                  <button className="btn btnGhost dark" type="submit">
                    <XCircle size={17} aria-hidden="true" />
                    Teklifi Reddet
                  </button>
                </form>
              ) : null}
            </div>
          ) : null}
        </article>
      </section>
    </main>
  );
}

function getParam(params: SearchParams, key: string): string {
  const value = params[key];
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "-" : date.toLocaleDateString("tr-TR");
}
