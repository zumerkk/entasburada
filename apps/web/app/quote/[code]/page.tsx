import { notFound } from "next/navigation";
import { quoteStatusLabel } from "../../../lib/commercial-labels";
import { CheckCircle2, Download, MessageSquareText, XCircle } from "lucide-react";
import { StatusPill } from "@entas/ui";
import { getAdminOrderById, getQuoteByTrackingCode } from "../../../lib/commercial-repository";
import { approveQuoteByTrackingCodeAction, rejectQuoteByTrackingCodeAction, requestQuoteRevisionByTrackingCodeAction } from "../actions";
import { getCurrentCustomer } from "../../../lib/customer-auth";
import { canAccessCommercialRecord } from "../../../lib/commercial-access";

type SearchParams = Record<string, string | string[] | undefined>;

export const dynamic = "force-dynamic";

export default async function QuoteTrackingPage({ params, searchParams }: { params: Promise<{ code: string }>; searchParams: Promise<SearchParams> }) {
  const { code } = await params;
  const query = await searchParams;
  const [quote, customer] = await Promise.all([getQuoteByTrackingCode(code), getCurrentCustomer()]);
  const error = getParam(query, "error");
  const revisionRequested = getParam(query, "revision") === "requested";

  if (!quote || !canAccessCommercialRecord(quote, customer)) {
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
        <div className="pageIntroActions">
          <a className="btn btnGhost dark" href={`/api/quotes/${encodeURIComponent(quote.trackingCode)}/export?format=pdf`}><Download size={16} /> PDF</a>
          <a className="btn btnGhost dark" href={`/api/quotes/${encodeURIComponent(quote.trackingCode)}/export?format=xlsx`}><Download size={16} /> Excel</a>
        </div>
      </section>

      <section className="shell trackingGrid">
        <article className="panel trackingDetail">
          {error ? <div className="formError">{error}</div> : null}
          {revisionRequested ? <div className="trackingNotice success"><strong>Revizyon talebiniz temsilciye iletildi.</strong></div> : null}
          <div className="detailSummaryGrid">
            <div>
              <span>Takip kodu</span>
              <strong>{quote.trackingCode}</strong>
            </div>
            <div>
              <span>Durum</span>
              <StatusPill tone={quoteStatusLabel(quote.status).tone}>{quoteStatusLabel(quote.status).label}</StatusPill>
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
              <span>KDV dahil toplam</span>
              <strong>
                {quote.totalAmount} {quote.currency}
              </strong>
            </div>
            <div>
              <span>Geçerlilik</span>
              <strong>{formatDate(quote.validUntil)} · {validityLabel(quote.validUntil)}</strong>
            </div>
            <div>
              <span>Revizyon</span>
              <strong>Revizyon {quote.revisionNumber || 0}</strong>
            </div>
            <div>
              <span>Sevkiyat</span>
              <strong>{quote.allowPartialShipment ? "Kısmi sevkiyata uygun" : "Tek sevkiyat"}</strong>
            </div>
          </div>

          <form className="quoteResponseForm" action={approveQuoteByTrackingCodeAction}>
            <input type="hidden" name="trackingCode" value={quote.trackingCode} />
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
                  {canApprove ? <input type="checkbox" name="acceptedItemId" value={item.id} defaultChecked={item.customerDecision !== "REJECTED"} aria-label={`${item.productName} satırını kabul et`} /> : null}
                  <strong>{item.productName}</strong>
                  <small>{item.sku}</small>
                </span>
                <span>
                  {item.quantity} {item.unit}
                </span>
                <span>{item.targetPrice ? `${item.targetPrice} ${item.currency}` : "-"}</span>
                <span>
                  {item.quotedUnitPrice ? `${item.quotedUnitPrice} ${item.currency}` : "Fiyat bekleniyor"}
                  {item.quotedUnitPrice ? <small>KDV dahil</small> : null}
                </span>
              </div>
            ))}
          </div>

          {quote.messages.length > 0 ? (
            <div className="quoteMessageList public">
              {quote.messages.map((message) => <div className={message.actor} key={message.id}><strong>{message.author}</strong><p>{message.body}</p><small>{new Date(message.createdAt).toLocaleString("tr-TR")}</small></div>)}
            </div>
          ) : null}

          {order ? (
            <div className="trackingNotice success">
              <strong>Sipariş oluşturuldu</strong>
              <a className="btn btnPrimary" href={`/orders/${encodeURIComponent(order.trackingCode)}`}>
                {order.orderNo} siparişini takip et
              </a>
            </div>
          ) : canApprove || canReject ? (
            <div className="quoteResponsePanel">
              <label><MessageSquareText size={17} /> Yanıt / revizyon notu<textarea name="responseNote" placeholder="Değişmesini istediğiniz fiyat, miktar, ürün veya termin bilgisini yazın." /></label>
            <div className="trackingActions">
              {canApprove ? (
                  <button className="btn btnPrimary" type="submit" formAction={approveQuoteByTrackingCodeAction}>
                    <CheckCircle2 size={17} aria-hidden="true" />
                    Seçili Satırları Onayla ve Siparişe Çevir
                  </button>
              ) : null}
              {canApprove ? <button className="btn btnSecondary" type="submit" formAction={requestQuoteRevisionByTrackingCodeAction}><MessageSquareText size={17} /> Revizyon İste</button> : null}
              {canReject ? (
                  <button className="btn btnGhost dark" type="submit" formAction={rejectQuoteByTrackingCodeAction}>
                    <XCircle size={17} aria-hidden="true" />
                    Teklifi Reddet
                  </button>
              ) : null}
            </div>
            </div>
          ) : null}
          </form>

          <div className="commercialTimeline">
            {quote.history.map((entry) => <div key={entry.id}><strong>{entry.message}</strong><span>{entry.actorName} · {new Date(entry.at).toLocaleString("tr-TR")}</span></div>)}
          </div>
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

function validityLabel(value: string): string {
  const remaining = Date.parse(value) - Date.now();
  if (!Number.isFinite(remaining) || remaining < 0) return "süresi doldu";
  const days = Math.max(1, Math.ceil(remaining / 86_400_000));
  return `${days} gün kaldı`;
}
