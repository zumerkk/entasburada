import { AlertTriangle, FileSpreadsheet, ShoppingCart } from "lucide-react";
import { requireCustomer } from "../../lib/customer-auth";
import { QuickOrderLines } from "../../components/QuickOrderLines";
import { addQuickOrderItemsAction } from "../cart/actions";

type SearchParams = Record<string, string | string[] | undefined>;

const units = ["Adet", "Koli", "Paket", "Metre", "Kg", "Litre", "Takim"];

export const dynamic = "force-dynamic";

export default async function QuickOrderPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requireCustomer();
  const params = await searchParams;
  const error = getParam(params, "error");
  const initialSku = getParam(params, "sku");
  const initialName = getParam(params, "name");
  const initialProductSlug = getParam(params, "productSlug");
  const initialUnit = getParam(params, "unit");

  return (
    <main>
      <section className="shell pageIntro">
        <div>
          <span className="eyebrow dark">Hızlı sipariş</span>
          <h1>SKU, barkod veya ürün adıyla toplu giriş</h1>
          <p>Satırları doldurun veya Excel/CSV/TSV yükleyin; ürünler bayi sepetinize fiyatlı olarak eklensin.</p>
        </div>
      </section>

      <section className="shell formLayout">
        <form className="applicationForm quoteForm" action={addQuickOrderItemsAction}>
          {error ? <div className="cartAlert danger spanTwo"><AlertTriangle size={18} aria-hidden="true" /><span>{error}</span></div> : null}
          <fieldset>
            <legend>Ürün satırları</legend>
            <QuickOrderLines initialSku={initialSku} initialName={initialName} initialProductSlug={initialProductSlug} initialUnit={initialUnit} units={units} />
          </fieldset>

          <fieldset>
            <legend>Dosya ile yükle</legend>
            <label>
              Excel/CSV/TSV ürün listesi
              <input type="file" name="quickOrderFile" accept=".xlsx,.csv,.tsv,text/csv,text/tab-separated-values,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" />
            </label>
            <div className="fileUploadHint spanTwo">
              <FileSpreadsheet size={18} aria-hidden="true" />
              <span>Kolonlar: SKU, Ürün adı, Adet, Birim</span>
            </div>
          </fieldset>

          <div className="formActions">
            <button className="btn btnPrimary" type="submit">
              <ShoppingCart size={18} aria-hidden="true" />
              Sepete Ekle
            </button>
            <a className="btn btnGhost dark" href="/cart">
              Sepeti Aç
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
