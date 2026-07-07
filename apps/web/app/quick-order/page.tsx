import { FileSpreadsheet, ShoppingCart } from "lucide-react";
import { requireCustomer } from "../../lib/customer-auth";
import { addQuickOrderItemsAction } from "../cart/actions";

type SearchParams = Record<string, string | string[] | undefined>;

const units = ["Adet", "Koli", "Paket", "Metre", "Kg", "Litre", "Takim"];

export const dynamic = "force-dynamic";

export default async function QuickOrderPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requireCustomer();
  const params = await searchParams;
  const initialSku = getParam(params, "sku");
  const initialName = getParam(params, "name");
  const rows = Array.from({ length: 10 }, (_, index) => ({
    sku: index === 0 ? initialSku : "",
    name: index === 0 ? initialName : "",
    quantity: index === 0 && initialSku ? "1" : ""
  }));

  return (
    <main>
      <section className="shell pageIntro">
        <div>
          <span className="eyebrow dark">Hızlı sipariş</span>
          <h1>SKU, barkod veya ürün adıyla toplu giriş</h1>
          <p>Satırları doldurun veya CSV/TSV yükleyin; ürünler bayi sepetinize fiyatlı olarak eklensin.</p>
        </div>
      </section>

      <section className="shell formLayout">
        <form className="applicationForm quoteForm" action={addQuickOrderItemsAction}>
          <fieldset>
            <legend>Ürün satırları</legend>
            <div className="quoteLines">
              {rows.map((line, index) => (
                <div className="quoteLine quickOrderLine" key={index}>
                  <input name="itemSku" placeholder="SKU veya barkod" defaultValue={line.sku} />
                  <input name="itemName" placeholder="Ürün adı" defaultValue={line.name} />
                  <input name="itemQuantity" type="number" min="1" placeholder="Adet" defaultValue={line.quantity} />
                  <select name="itemUnit" defaultValue="Adet">
                    {units.map((unit) => (
                      <option value={unit} key={unit}>
                        {unit}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          </fieldset>

          <fieldset>
            <legend>Dosya ile yükle</legend>
            <label>
              CSV/TSV ürün listesi
              <input type="file" name="quickOrderFile" accept=".csv,.tsv,text/csv,text/tab-separated-values" />
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
