import { FileText, RotateCcw, ShoppingCart } from "lucide-react";
import { EmptyState, StatusPill } from "@entas/ui";
import { loadPricedCart } from "../../lib/cart-repository";
import { requireCustomer } from "../../lib/customer-auth";
import { clearCartAction, createOrderFromCartAction, createQuoteFromCartAction, updateCartAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function CartPage() {
  const customer = await requireCustomer();
  const cart = await loadPricedCart(customer);

  return (
    <main>
      <section className="shell pageIntro compact">
        <div>
          <span className="eyebrow dark">Bayi sepeti</span>
          <h1>{customer.companyName}</h1>
          <p>Sepetteki ürünler müşteri özel fiyat kurallarınızla hesaplanır.</p>
        </div>
        <a className="btn btnSecondary" href="/quick-order">
          Hızlı Sipariş
        </a>
      </section>

      <section className="shell trackingGrid">
        {cart.items.length > 0 ? (
          <>
            <form className="panel" action={updateCartAction}>
              <div className="panelHeader">
                <div>
                  <h2>{cart.items.length.toLocaleString("tr-TR")} sepet satırı</h2>
                  <p>Toplam: {cart.displayTotal}</p>
                </div>
                <StatusPill tone="success">{customer.segment} bayi fiyatı</StatusPill>
              </div>
              <div className="commercialTable">
                <div className="commercialTableHead cartItemRows">
                  <span>Ürün</span>
                  <span>Adet</span>
                  <span>Birim fiyat</span>
                  <span>İskonto</span>
                  <span>Tutar</span>
                </div>
                {cart.items.map((item) => (
                  <div className="commercialTableRow cartItemRows" key={item.id}>
                    <span>
                      <strong>{item.productName}</strong>
                      <small>
                        {item.sku} {item.priceRuleLabel ? `· ${item.priceRuleLabel}` : ""}
                      </small>
                    </span>
                    <label>
                      <input type="hidden" name="itemId" value={item.id} />
                      <input name={`quantity:${item.id}`} type="number" min="0" defaultValue={item.quantity} />
                    </label>
                    <span>{item.displayUnitPrice}</span>
                    <span>{item.discountRate ?? "-"}</span>
                    <span>{item.displayLineTotal}</span>
                  </div>
                ))}
              </div>
              <div className="formActions cartActions">
                <button className="btn btnGhost dark" type="submit">
                  <RotateCcw size={17} aria-hidden="true" />
                  Miktarları Güncelle
                </button>
              </div>
            </form>

            <section className="panel cartCheckoutPanel">
              <div>
                <span>Sepet toplamı</span>
                <strong>{cart.displayTotal}</strong>
              </div>
              <div className="commercialActionRow">
                <form action={createQuoteFromCartAction}>
                  <button className="btn btnSecondary" type="submit">
                    <FileText size={17} aria-hidden="true" />
                    Teklif Oluştur
                  </button>
                </form>
                <form action={createOrderFromCartAction}>
                  <button className="btn btnPrimary" type="submit">
                    <ShoppingCart size={17} aria-hidden="true" />
                    Sipariş Oluştur
                  </button>
                </form>
                <form action={clearCartAction}>
                  <button className="btn btnGhost dark" type="submit">
                    Sepeti Temizle
                  </button>
                </form>
              </div>
            </section>
          </>
        ) : (
          <EmptyState
            title="Sepetiniz boş."
            body="Hızlı sipariş ekranından SKU ve adet girerek veya katalogdan ürün seçerek sepet oluşturabilirsiniz."
            action={
              <a className="btn btnPrimary" href="/quick-order">
                Hızlı Siparişe Git
              </a>
            }
          />
        )}
      </section>
    </main>
  );
}
