import { FileText, Search, Truck } from "lucide-react";
import { orderStatusLabel, quoteStatusLabel } from "../../lib/commercial-labels";
import { EmptyState, StatusPill } from "@entas/ui";
import { getOrderByTrackingCode, getQuoteByTrackingCode } from "../../lib/commercial-repository";
import { getCurrentCustomer } from "../../lib/customer-auth";
import { canAccessCommercialRecord } from "../../lib/commercial-access";

type SearchParams = Record<string, string | string[] | undefined>;

export const dynamic = "force-dynamic";

export default async function OrderLookupPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const code = getParam(params, "code");
  const [foundOrder, foundQuote, customer] = code
    ? await Promise.all([getOrderByTrackingCode(code), getQuoteByTrackingCode(code), getCurrentCustomer()])
    : [null, null, await getCurrentCustomer()];
  const order = foundOrder && canAccessCommercialRecord(foundOrder, customer) ? foundOrder : null;
  const quote = foundQuote && canAccessCommercialRecord(foundQuote, customer) ? foundQuote : null;

  return (
    <main>
      <section className="shell pageIntro">
        <div>
          <span className="eyebrow dark">Takip</span>
          <h1>Teklif ve sipariş takibi</h1>
          <p>Teklif veya sipariş takip kodunuzu girerek güncel durumu görüntüleyin.</p>
        </div>
      </section>

      <section className="shell trackingGrid">
        <form className="panel trackingLookup" action="/orders">
          <label>
            Takip kodu
            <input name="code" defaultValue={code} placeholder="T12345678 veya S12345678" />
          </label>
          <button className="btn btnPrimary" type="submit">
            <Search size={17} aria-hidden="true" />
            Sorgula
          </button>
        </form>

        {order ? (
          <article className="panel trackingResult">
            <Truck size={24} aria-hidden="true" />
            <div>
              <span>Sipariş bulundu</span>
              <h2>{order.orderNo}</h2>
              <p>
                {order.companyName} · <StatusPill tone={orderStatusLabel(order.status).tone}>{orderStatusLabel(order.status).label}</StatusPill>
              </p>
            </div>
            <a className="btn btnPrimary" href={`/orders/${encodeURIComponent(order.trackingCode)}`}>
              Sipariş Detayı
            </a>
          </article>
        ) : quote ? (
          <article className="panel trackingResult">
            <FileText size={24} aria-hidden="true" />
            <div>
              <span>Teklif bulundu</span>
              <h2>{quote.quoteNo}</h2>
              <p>
                {quote.companyName} · <StatusPill tone={quoteStatusLabel(quote.status).tone}>{quoteStatusLabel(quote.status).label}</StatusPill>
              </p>
            </div>
            <a className="btn btnPrimary" href={`/quote/${encodeURIComponent(quote.trackingCode)}`}>
              Teklif Detayı
            </a>
          </article>
        ) : code ? (
          <EmptyState title="Kayıt bulunamadı." body="Takip kodunu kontrol edip yeniden deneyin." />
        ) : null}
      </section>
    </main>
  );
}

function getParam(params: SearchParams, key: string): string {
  const value = params[key];
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}
