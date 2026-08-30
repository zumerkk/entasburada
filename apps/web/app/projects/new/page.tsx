import { FileSpreadsheet, Plus } from "lucide-react";
import { requireCustomer } from "../../../lib/customer-auth";
import { createProjectAction } from "../actions";

export const dynamic = "force-dynamic";
const units = ["Adet", "Koli", "Paket", "Metre", "Kg", "Litre", "Takım"];

export default async function NewProjectPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const customer = await requireCustomer();
  const { error } = await searchParams;
  return (
    <main>
      <section className="shell pageIntro compact">
        <div>
          <span className="eyebrow dark">Yeni çalışma</span>
          <h1>Şantiye veya proje oluştur</h1>
          <p>Malzeme satırlarını elle girin ya da XLSX, CSV veya TSV dosyası yükleyin.</p>
        </div>
      </section>
      <section className="shell formLayout">
        <form className="applicationForm quoteForm projectCreateForm" action={createProjectAction}>
          {error ? <div className="formError spanTwo">{error}</div> : null}
          <fieldset>
            <legend>Proje bilgileri</legend>
            <label>Proje / şantiye adı<input name="name" required placeholder="Örn. Çayyolu Villa Projesi" /></label>
            <label>Proje kodu<input name="code" placeholder="Boş bırakılırsa otomatik oluşur" /></label>
            <label>Şantiye / lokasyon<input name="jobsite" placeholder={customer.city} /></label>
            <label>İstenen teslim tarihi<input name="desiredDeliveryDate" type="date" /></label>
            <label className="spanTwo">Teslimat adresi<textarea name="deliveryAddress" defaultValue={customer.deliveryAddress} /></label>
            <label className="spanTwo">Proje notu<textarea name="note" placeholder="Katlara göre teslim, marka tercihi, teknik notlar..." /></label>
          </fieldset>
          <fieldset>
            <legend>Elle malzeme girişi</legend>
            <div className="quoteLines spanTwo">
              {Array.from({ length: 8 }, (_, index) => (
                <div className="quoteLine quickOrderLine" key={index}>
                  <input name="itemSku" placeholder="SKU / barkod" />
                  <input name="itemName" placeholder="Ürün veya teknik tarif" />
                  <input name="itemQuantity" type="number" min="1" placeholder="Adet" />
                  <select name="itemUnit" defaultValue="Adet">{units.map((unit) => <option key={unit}>{unit}</option>)}</select>
                </div>
              ))}
            </div>
          </fieldset>
          <fieldset>
            <legend>Excel veya CSV yükle</legend>
            <label className="spanTwo">Malzeme listesi<input type="file" name="materialFile" accept=".xlsx,.csv,.tsv,text/csv,text/tab-separated-values,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" /></label>
            <div className="fileUploadHint spanTwo"><FileSpreadsheet size={18} /><span>Kolonlar otomatik tanınır: SKU, ürün adı, miktar, birim, hedef fiyat ve not.</span></div>
          </fieldset>
          <div className="formActions">
            <button className="btn btnPrimary" type="submit"><Plus size={17} /> Projeyi Oluştur ve Eşleştir</button>
            <a className="btn btnGhost dark" href="/projects">Projelerim</a>
          </div>
        </form>
      </section>
    </main>
  );
}
