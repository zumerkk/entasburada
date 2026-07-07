import { FileText, Search } from "lucide-react";
import { EmptyState, StatusPill } from "@entas/ui";
import { requireAdmin } from "../../../lib/admin-auth";
import { searchAdminQuotes } from "../../../lib/commercial-repository";
import { convertQuoteToOrderAction, updateQuoteStatusAction } from "../actions";
import { AdminFrame } from "../AdminFrame";

type SearchParams = Record<string, string | string[] | undefined>;

const quoteStatuses = ["all", "DRAFT", "SUBMITTED", "ASSIGNED", "PRICED", "APPROVED", "REJECTED", "EXPIRED", "CONVERTED"];

export const dynamic = "force-dynamic";

export default async function AdminQuotesPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requireAdmin();
  const params = await searchParams;
  const q = getParam(params, "q");
  const status = getParam(params, "status") || "all";
  const company = getParam(params, "company");
  const salesRepresentative = getParam(params, "salesRepresentative");
  const dateFrom = getParam(params, "dateFrom");
  const dateTo = getParam(params, "dateTo");
  const page = Math.max(1, Number(getParam(params, "page") || "1"));
  const limit = 25;
  const quotes = await searchAdminQuotes({ q, status, company, salesRepresentative, dateFrom, dateTo, limit, offset: (page - 1) * limit });
  const safePage = Math.floor(quotes.offset / quotes.limit) + 1;
  const pageCount = Math.max(1, Math.ceil(quotes.total / quotes.limit));

  return (
    <AdminFrame active="quotes">
      <header className="adminTopbar">
        <div>
          <span>Teklifler</span>
          <h1>Teklif yönetimi</h1>
        </div>
        <a className="btn btnPrimary" href="/quote">
          <FileText size={17} aria-hidden="true" />
          Yeni Teklif Oluştur
        </a>
      </header>

      <section className="panel">
        <form className="adminFilterForm quotesFilter" action="/admin/quotes">
          <label>
            Arama
            <input name="q" defaultValue={q} placeholder="Teklif no, firma, bayi" />
          </label>
          <label>
            Durum
            <select name="status" defaultValue={status}>
              {quoteStatuses.map((item) => (
                <option value={item} key={item}>
                  {item === "all" ? "Tüm durumlar" : item}
                </option>
              ))}
            </select>
          </label>
          <label>
            Firma
            <input name="company" defaultValue={company} />
          </label>
          <label>
            Satış temsilcisi
            <input name="salesRepresentative" defaultValue={salesRepresentative} />
          </label>
          <label>
            Başlangıç
            <input name="dateFrom" type="date" defaultValue={dateFrom} />
          </label>
          <label>
            Bitiş
            <input name="dateTo" type="date" defaultValue={dateTo} />
          </label>
          <button className="btn btnGhost dark" type="submit">
            <Search size={17} aria-hidden="true" />
            Filtrele
          </button>
        </form>
      </section>

      <section className="panel">
        <div className="panelHeader">
          <div>
            <h2>{quotes.total.toLocaleString("tr-TR")} teklif</h2>
            <p>Teklifler gerçek ticari veri deposundan okunur; demo satır üretilmez.</p>
          </div>
        </div>
        {quotes.items.length > 0 ? (
          <div className="adminTable">
            <div className="adminTableHead quoteRows">
              <span>Teklif</span>
              <span>Firma / Bayi</span>
              <span>Tarih</span>
              <span>Durum</span>
              <span>Tutar</span>
              <span>Temsilci</span>
              <span>Geçerlilik</span>
              <span>Aksiyon</span>
            </div>
            {quotes.items.map((quote) => (
              <div className="adminTableRow quoteRows" key={quote.id}>
                <span>
                  <strong>{quote.quoteNo}</strong>
                  <small>{quote.convertedToOrder ? "Siparişe dönüştü" : "Siparişe dönüşmedi"}</small>
                </span>
                <span>
                  <strong>{quote.companyName}</strong>
                  <small>{quote.dealerName}</small>
                </span>
                <span>{formatDate(quote.requestedAt)}</span>
                <span>
                  <StatusPill tone={quote.status === "APPROVED" ? "success" : quote.status === "REJECTED" ? "danger" : "info"}>{quote.status}</StatusPill>
                </span>
                <span>
                  {quote.totalAmount} {quote.currency}
                </span>
                <span>{quote.salesRepresentative}</span>
                <span>{formatDate(quote.validUntil)}</span>
                <span className="rowActions">
                  <a href={`/admin/quotes/${quote.id}`}>Detay</a>
                  <form action={updateQuoteStatusAction}>
                    <input type="hidden" name="quoteId" value={quote.id} />
                    <input type="hidden" name="status" value="APPROVED" />
                    <button type="submit" disabled={quote.status === "CONVERTED" || quote.status === "REJECTED"}>
                      Onayla
                    </button>
                  </form>
                  <form action={updateQuoteStatusAction}>
                    <input type="hidden" name="quoteId" value={quote.id} />
                    <input type="hidden" name="status" value="REJECTED" />
                    <button type="submit" disabled={quote.status === "CONVERTED" || quote.status === "REJECTED"}>
                      Reddet
                    </button>
                  </form>
                  <form action={convertQuoteToOrderAction}>
                    <input type="hidden" name="quoteId" value={quote.id} />
                    <button type="submit" disabled={quote.convertedToOrder || quote.status === "REJECTED"}>
                      Siparişe dönüştür
                    </button>
                  </form>
                </span>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState
            title="Henüz oluşturulmuş teklif bulunmuyor."
            body="Bayi teklif talepleri oluştuğunda bu listede filtrelenebilir ve siparişe dönüştürülebilir şekilde görünecek."
            action={
              <a className="btn btnPrimary" href="/quote">
                Yeni Teklif Oluştur
              </a>
            }
          />
        )}
      </section>

      <nav className="pagination adminPagination" aria-label="Teklif sayfalama">
        <a className={safePage <= 1 ? "disabled" : ""} href={safePage <= 1 ? "#" : pageHref(params, safePage - 1)}>
          Önceki
        </a>
        <span>
          {safePage.toLocaleString("tr-TR")} / {pageCount.toLocaleString("tr-TR")}
        </span>
        <a className={safePage >= pageCount ? "disabled" : ""} href={safePage >= pageCount ? "#" : pageHref(params, safePage + 1)}>
          Sonraki
        </a>
      </nav>
    </AdminFrame>
  );
}

function getParam(params: SearchParams, key: string): string {
  const value = params[key];
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function pageHref(params: SearchParams, page: number): string {
  const next = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    const scalar = Array.isArray(value) ? value[0] : value;
    if (scalar && key !== "page") {
      next.set(key, scalar);
    }
  }
  next.set("page", String(page));
  return `/admin/quotes?${next.toString()}`;
}

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "-" : date.toLocaleDateString("tr-TR");
}
