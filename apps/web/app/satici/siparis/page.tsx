import { redirect } from "next/navigation";
import { AlertTriangle, ArrowLeft, PackageCheck, ShieldCheck, Truck } from "lucide-react";
import { loadPricedCart } from "../../../lib/cart-repository";
import { requireCustomer } from "../../../lib/customer-auth";
import { createDropshipOrderFromCartAction } from "../actions";

type SearchParams = Record<string, string | string[] | undefined>;
export const dynamic = "force-dynamic";

export default async function DropshipOrderPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const customer = await requireCustomer();
  const access = customer.sellerAccess;
  if (!access?.enabled || (access.mode !== "dropshipping" && access.mode !== "hybrid")) redirect("/satici");
  const [cart, params] = await Promise.all([loadPricedCart(customer), searchParams]);
  const error = getParam(params, "error");

  return (
    <main className="sellerPortal dropshipCheckout">
      <section className="shell sellerSubHeader">
        <a href="/satici"><ArrowLeft size={16} /> Satıcı merkezine dön</a>
        <span>Dropshipping operasyonu</span>
        <h1>Son müşteriye sipariş oluştur</h1>
        <p>Sepetinizdeki ürünleri alıcının adresine, hesabınız izin veriyorsa ENTAŞBURADA evraksız kör kargo ile gönderin.</p>
      </section>
      <section className="shell dropshipGrid">
        <form className="applicationForm dropshipForm" action={createDropshipOrderFromCartAction}>
          {error ? <div className="cartAlert danger spanTwo"><AlertTriangle size={18} /><span>{error}</span></div> : null}
          <fieldset>
            <legend>Mağaza ve alıcı bilgileri</legend>
            <label>Mağaza sipariş numarası *<input name="externalOrderId" required minLength={2} maxLength={100} placeholder="Örn. TY-104582" /></label>
            <label>Alıcı adı soyadı *<input name="recipientName" required minLength={2} maxLength={140} /></label>
            <label>Alıcı telefonu *<input name="recipientPhone" type="tel" required minLength={10} maxLength={32} /></label>
            <label>İl *<input name="deliveryCity" required minLength={2} maxLength={100} /></label>
            <label className="spanTwo">Açık teslimat adresi *<textarea name="deliveryAddress" required minLength={10} maxLength={600} rows={4} /></label>
            <label className="spanTwo">Sipariş notu<textarea name="note" maxLength={2000} rows={3} placeholder="Paketleme veya teslimat notu" /></label>
            {access.blindShippingEnabled ? <label className="checkboxLabel spanTwo"><input type="checkbox" name="blindShipping" defaultChecked /> Kör kargo: ENTAŞBURADA fiyat/fatura/marka evrakı pakete konmasın</label> : null}
          </fieldset>
          <div className="dropshipSecurity spanTwo"><ShieldCheck size={19} /><span>Alıcı bilgileri yalnızca siparişin sevkiyatı için kullanılır. Aynı mağaza sipariş numarası tekrar gönderilirse mükerrer sipariş açılmaz.</span></div>
          <div className="formActions">
            <button className="btn btnPrimary" type="submit" disabled={cart.items.length === 0 || !cart.canCreateOrder}><Truck size={18} /> Dropship siparişini oluştur</button>
            <a className="btn btnGhost dark" href="/satici#urunler">Ürün ekle</a>
          </div>
        </form>
        <aside className="dropshipCartSummary">
          <div><span>Sipariş özeti</span><strong>{cart.items.length.toLocaleString("tr-TR")} ürün satırı</strong><small>{cart.displayTotal} · KDV dahil</small></div>
          {cart.items.map((item) => <div className="dropshipCartLine" key={item.id}><span><strong>{item.productName}</strong><small>{item.sku}</small></span><span>{item.quantity} {item.unit}<small>{item.displayLineTotal}</small></span></div>)}
          {cart.items.length === 0 ? <div className="sellerEmpty"><PackageCheck size={20} /> Sepetiniz boş. Önce satıcı kataloğundan ürün ekleyin.</div> : null}
          {!cart.canCreateOrder && cart.items.length > 0 ? <p className="formError">{cart.orderBlockReason}</p> : null}
        </aside>
      </section>
    </main>
  );
}

function getParam(params: SearchParams, key: string): string { const value = params[key]; return Array.isArray(value) ? value[0] ?? "" : value ?? ""; }
