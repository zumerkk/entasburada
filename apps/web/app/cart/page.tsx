import { AlertTriangle, ArrowLeft, CreditCard, FileText, RotateCcw, ShoppingCart, Trash2, Truck } from "lucide-react";
import { EmptyState, StatusPill } from "@entas/ui";
import { CartQuantityField } from "../../components/CartQuantityField";
import { loadPricedCart } from "../../lib/cart-repository";
import { requireCustomer } from "../../lib/customer-auth";
import { convertToTry, normalizeCurrencyCode } from "../../lib/fx";
import { installmentOptions } from "../../lib/installments";
import { parseMoney } from "../../lib/customer-pricing";
import { clearCartAction, createOrderFromCartAction, createQuoteFromCartAction, payCartWithCardAction, removeCartItemAction, updateCartAction } from "./actions";

export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;

export default async function CartPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const customer = await requireCustomer();
  const params = await searchParams;
  const error = getParam(params, "error");
  const cart = await loadPricedCart(customer);

  // Tahsilat TRY yapılır. Sepet USD/EUR ise TCMB kuruyla çevrilen tutar ve taksit
  // seçenekleri burada gösterilir; müşteri ödemeden önce ne ödeyeceğini görür.
  let plan: { options: ReturnType<typeof installmentOptions>; converted: number; rate: number } | null = null;
  let planError: string | null = null;
  if (cart.canCreateOrder && cart.items.length > 0) {
    try {
      const charge = await convertToTry(parseMoney(cart.totalAmount), cart.currency);
      plan = { options: installmentOptions(charge.amount), converted: charge.amount, rate: charge.rate };
    } catch (fxError) {
      planError = fxError instanceof Error ? fxError.message : "Kur bilgisi alınamadı.";
    }
  }
  const cartCurrency = normalizeCurrencyCode(cart.currency);

  return (
    <main>
      <section className="shell pageIntro compact">
        <div>
          <span className="eyebrow dark">Bayi sepeti</span>
          <h1>{customer.companyName}</h1>
          <p>Sepetteki ürünler herkes için geçerli ortak marka fiyatlarıyla, KDV dahil hesaplanır.</p>
        </div>
        <div className="pageIntroActions">
          <a className="btn btnGhost dark" href="/catalog">
            <ArrowLeft size={17} aria-hidden="true" />
            Alışverişe Devam Et
          </a>
          <a className="btn btnSecondary" href="/quick-order">Hızlı Sipariş</a>
        </div>
      </section>

      <section className="shell trackingGrid">
        {error ? <div className="cartAlert danger"><AlertTriangle size={18} aria-hidden="true" /><span>{error}</span></div> : null}
        {cart.items.length > 0 ? (
          <div className="cartWorkspace">
            <form className="panel cartItemsPanel" action={updateCartAction}>
              <div className="panelHeader">
                <div>
                  <h2>{cart.items.length.toLocaleString("tr-TR")} sepet satırı</h2>
                  <p>KDV dahil toplam: {cart.displayTotal}</p>
                </div>
                <StatusPill tone="success">Ortak marka fiyatı</StatusPill>
              </div>
              <div className="commercialTable">
                <div className="commercialTableHead cartItemRows">
                  <span>Ürün</span>
                  <span>Adet</span>
                  <span>Birim fiyat</span>
                  <span>Fiyat kuralı</span>
                  <span>Tutar</span>
                  <span>İşlem</span>
                </div>
                {cart.items.map((item) => (
                  <div className="commercialTableRow cartItemRows" key={item.id}>
                    <span className="cartProductCell">
                      <span className="cartProductImage">
                        {item.image ? <img src={item.image} alt="" loading="lazy" /> : <ShoppingCart size={20} aria-hidden="true" />}
                      </span>
                      <span>
                        {item.slug ? <a href={`/products/${item.slug}`}><strong>{item.productName}</strong></a> : <strong>{item.productName}</strong>}
                        <small>{item.sku} · {item.unit}</small>
                        <small>{item.stockLabel ?? "Stok teyidi gerekli"}</small>
                      </span>
                    </span>
                    <span>
                      <input type="hidden" name="itemId" value={item.id} />
                      <CartQuantityField name={`quantity:${item.id}`} initialValue={item.quantity} minOrder={item.minOrder} unit={item.unit} />
                    </span>
                    <span>
                      {item.priceAvailable ? item.displayUnitPrice : <strong className="pricePending">{item.priceUnavailableMessage ? "Fiyat bilgisi verilmiyor" : "Fiyat teyidi"}</strong>}
                      {item.priceAvailable ? <small>KDV dahil</small> : item.priceUnavailableMessage ? <small>{item.priceUnavailableMessage}</small> : null}
                    </span>
                    <span>{item.discountRate ? `${item.discountRate} iskonto` : item.priceLabel ?? "-"}</span>
                    <span>{item.priceAvailable ? item.displayLineTotal : "-"}</span>
                    <span>
                      <button className="cartRemoveButton" type="submit" formAction={removeCartItemAction.bind(null, item.id)}>
                        <Trash2 size={15} aria-hidden="true" />
                        Kaldır
                      </button>
                    </span>
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

            <aside className="panel cartCheckoutPanel">
              <div className="cartSummaryHeading">
                <span>Sepet özeti</span>
                <strong>{cart.items.length.toLocaleString("tr-TR")} ürün</strong>
              </div>
              <div className="cartCurrencyTotals">
                {cart.totals.map((total) => (
                  <div key={total.currency}>
                    <span>{total.currency} KDV dahil toplamı</span>
                    <strong>{total.displayTotal}</strong>
                    <small>
                      Dahil KDV: {cart.includedTaxTotals.find((tax) => tax.currency === total.currency)?.displayTotal ?? "-"}
                    </small>
                  </div>
                ))}
              </div>
              <div className={`cartAlert ${cart.qualifiesForFreeShipping ? "success" : "info"}`}>
                <Truck size={18} aria-hidden="true" />
                <span>
                  <strong>{cart.shippingMessage}</strong>
                  {!cart.qualifiesForFreeShipping ? ` ${cart.displayFreeShippingThreshold} üzeri kargo bizden.` : null}
                </span>
              </div>
              {cart.orderBlockReason ? (
                <div className="cartAlert warning">
                  <AlertTriangle size={18} aria-hidden="true" />
                  <span>{cart.orderBlockReason} Teklif oluşturarak satış temsilcinize iletebilirsiniz.</span>
                </div>
              ) : null}
              {plan ? (
                <div className="cartPaymentPlan">
                  {cartCurrency !== "TRY" ? (
                    <p className="installmentNote">
                      Sepet {cart.displayTotal} ({cartCurrency}) · TCMB kuru{" "}
                      {plan.rate.toLocaleString("tr-TR", { maximumFractionDigits: 4 })} ile{" "}
                      <strong>{formatTryValue(plan.converted)}</strong> olarak tahsil edilir.
                    </p>
                  ) : null}
                  <p className="installmentNote">
                    Taksit seçenekleri ödeme adımında görüntülenir.
                  </p>
                </div>
              ) : null}
              {planError ? <p className="formError">Kart ödemesi şu an kullanılamıyor: {planError}</p> : null}

              <div className="commercialActionRow">
                <form action={createQuoteFromCartAction}>
                  <button className="btn btnSecondary" type="submit">
                    <FileText size={17} aria-hidden="true" />
                    Teklif Oluştur
                  </button>
                </form>
                <form action={payCartWithCardAction} className="cartPayForm">
                  <button className="btn btnPrimary" type="submit" disabled={!cart.canCreateOrder || !plan} title={cart.orderBlockReason}>
                    <CreditCard size={17} aria-hidden="true" />
                    Kartla Öde
                  </button>
                </form>
                <form action={createOrderFromCartAction}>
                  <button className="btn btnSecondary" type="submit" disabled={!cart.canCreateOrder} title={cart.orderBlockReason}>
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
            </aside>
          </div>
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

function getParam(params: SearchParams, key: string): string {
  const value = params[key];
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function formatTryValue(value: number): string {
  return new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY" }).format(value);
}
