import { CheckCircle2, FileText, Search } from "lucide-react";
import { ClearQuoteBasket } from "../../../components/ClearQuoteBasket";
import { getQuoteByTrackingCode } from "../../../lib/commercial-repository";

type SearchParams = Record<string, string | string[] | undefined>;

export const dynamic = "force-dynamic";

export default async function QuoteSuccessPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const code = getParam(params, "code");
  const quote = code ? await getQuoteByTrackingCode(code) : null;

  return (
    <main>
      <ClearQuoteBasket />
      <section className="shell pageIntro successIntro">
        <div>
          <span className="eyebrow dark">Talep alındı</span>
          <h1>Teklif kaydınız oluşturuldu</h1>
          <p>Takip kodunuzla teklif ve sipariş durumunu izleyebilirsiniz.</p>
        </div>
      </section>

      <section className="shell trackingGrid">
        <article className="panel trackingPanel">
          <CheckCircle2 size={28} aria-hidden="true" />
          <span>Takip kodu</span>
          <strong>{quote?.trackingCode ?? code}</strong>
          {quote ? (
            <p>
              {quote.quoteNo} numaralı teklif admin paneline düştü. Fiyatlandırma tamamlandığında aynı ekrandan onay verip siparişe
              çevirebilirsiniz.
            </p>
          ) : (
            <p>Takip kodu oluşturuldu. Teklif ekranından tekrar sorgulayabilirsiniz.</p>
          )}
          <div className="trackingActions">
            <a className="btn btnPrimary" href={`/quote/${encodeURIComponent(quote?.trackingCode ?? code)}`}>
              <FileText size={17} aria-hidden="true" />
              Teklifi Gör
            </a>
            <a className="btn btnGhost dark" href="/orders">
              <Search size={17} aria-hidden="true" />
              Takip Sorgula
            </a>
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
