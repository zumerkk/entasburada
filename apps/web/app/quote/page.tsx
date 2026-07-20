import { FileText, Upload } from "lucide-react";
import { QuoteLines } from "../../components/QuoteLines";
import { getCurrentCustomer } from "../../lib/customer-auth";
import { submitQuoteAction } from "./actions";

type SearchParams = Record<string, string | string[] | undefined>;

const units = ["Adet", "Koli", "Paket", "Metre", "Kg", "Litre", "Takim"];

export const dynamic = "force-dynamic";

export default async function QuotePage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const customer = await getCurrentCustomer();
  const error = getParam(params, "error");
  const initialSku = getParam(params, "sku");
  const initialName = getParam(params, "name");
  const initialUnit = getParam(params, "unit") || "Adet";

  return (
    <main>
      <section className="shell pageIntro">
        <div>
          <span className="eyebrow dark">Teklif talebi</span>
          <h1>Toplu alım ve proje teklifinizi iletin</h1>
          <p>Ürünleri SKU, barkod veya ürün adıyla ekleyin; hedef fiyat, adet ve teslimat beklentinizi paylaşın.</p>
        </div>
      </section>

      <section className="shell formLayout">
        <form className="applicationForm quoteForm" action={submitQuoteAction}>
          {error ? <div className="formError">{error}</div> : null}
          <fieldset>
            <legend>Firma ve proje</legend>
            <label>
              Firma ünvanı
              <input name="companyTitle" defaultValue={customer?.companyName ?? ""} required />
            </label>
            <label>
              Yetkili kişi
              <input name="authorizedPerson" defaultValue={customer?.authorizedPerson ?? ""} required />
            </label>
            <label>
              Telefon
              <input name="phone" type="tel" defaultValue={customer?.phone ?? ""} required />
            </label>
            <label>
              E-posta
              <input name="email" type="email" defaultValue={customer?.email ?? ""} required />
            </label>
            <label>
              Proje adı
              <input name="projectName" />
            </label>
            <label>
              Proje kodu
              <input name="projectCode" />
            </label>
          </fieldset>

          <fieldset>
            <legend>Ürün satırları</legend>
            <QuoteLines units={[...units]} initialSku={initialSku || undefined} initialName={initialName || undefined} initialUnit={initialUnit || undefined} />
          </fieldset>

          <fieldset>
            <legend>Teslimat ve dosyalar</legend>
            <label>
              Teslimat ili
              <input name="deliveryCity" defaultValue={customer?.city ?? ""} />
            </label>
            <label>
              Ödeme tercihi
              <select name="paymentPreference" defaultValue="Havale/EFT">
                <option>Havale/EFT</option>
                <option>Kredi kartı</option>
                <option>Cari hesap</option>
                <option>Vadeli ödeme</option>
              </select>
            </label>
            <label className="spanTwo">
              Teslimat adresi
              <textarea name="deliveryAddress" defaultValue={customer?.deliveryAddress ?? ""} />
            </label>
            <label className="spanTwo">
              Not
              <textarea name="notes" />
            </label>
            <label>
              CSV/TSV ürün listesi
              <input type="file" name="quoteFile" accept=".csv,.tsv,text/csv,text/tab-separated-values" />
            </label>
            <div className="fileUploadHint">
              <Upload size={18} aria-hidden="true" />
              <span>Kolonlar: SKU, Ürün adı, Adet, Birim, Hedef fiyat</span>
            </div>
          </fieldset>

          <div className="formActions">
            <button className="btn btnPrimary" type="submit">
              <FileText size={18} aria-hidden="true" />
              Teklifi Gönder
            </button>
            <a className="btn btnGhost dark" href="/orders">
              Teklif/Sipariş Takibi
            </a>
          </div>
        </form>
      </section>
    </main>
  );
}

function getParam(params: SearchParams, key: string): string {
  const value = params[key];
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}
