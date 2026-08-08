import { notFound } from "next/navigation";
import { orderStatusLabel } from "../../../lib/commercial-labels";
import { ArrowLeft } from "lucide-react";
import { StatusPill } from "@entas/ui";
import { getOrderByTrackingCode } from "../../../lib/commercial-repository";
import { requireCustomer } from "../../../lib/customer-auth";
import { convertToTry, normalizeCurrencyCode } from "../../../lib/fx";
import { installmentOptions } from "../../../lib/installments";
import { isDirectPostEnabled } from "../../../lib/payment/ziraatpay";
import { InstallmentSelector } from "../../../components/InstallmentSelector";
import { PayNowButton } from "../../../components/PayNowButton";
import { FREE_SHIPPING_THRESHOLD_TRY } from "../../../lib/commercial-policy";

export const dynamic = "force-dynamic";

/**
 * Kart ödeme ekranı: taksit seçenekleri komisyon (vade farkı) dahil tutarlarıyla
 * listelenir; müşteri burada gördüğü tutarı öder.
 *
 * NEDEN KENDİ EKRANIMIZ: ZiraatPay'in ödeme sayfası taksit seçimine göre tutarı
 * değiştirmiyor (tüm taksitleri aynı toplamla gösteriyor). Vade farkı müşteriye
 * yansıtılabilsin diye seçim burada yapılır ve ZiraatPay'e nihai tutar gönderilir.
 */
export default async function CheckoutPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const customer = await requireCustomer();
  const order = await getOrderByTrackingCode(code);

  if (!order) {
    notFound();
  }

  // Güvenlik: yalnızca siparişin sahibi ödeme ekranını görebilir.
  if (normalizeEmail(order.email) !== normalizeEmail(customer.email)) {
    notFound();
  }

  const orderCurrency = normalizeCurrencyCode(order.currency);
  const hasFreeShipping = orderCurrency === "TRY" && parseAmount(order.totalAmount) >= FREE_SHIPPING_THRESHOLD_TRY;
  const alreadyPaid = order.paymentStatus?.toLowerCase().includes("ödendi");
  // DirectPost açıkken taksit seçimi (vade farkıyla) burada yapılır ve kilitlenir.
  // Kapalıyken tek ekran: ana tutar onaylanır, taksidi müşteri ZiraatPay'de seçer.
  const directPost = isDirectPostEnabled();

  let options: ReturnType<typeof installmentOptions> = [];
  let convertedAmount: number | null = null;
  let rate = 1;
  let fxError: string | null = null;
  try {
    const charge = await convertToTry(parseAmount(order.totalAmount), orderCurrency);
    convertedAmount = charge.amount;
    rate = charge.rate;
    options = installmentOptions(charge.amount);
  } catch (error) {
    fxError = error instanceof Error ? error.message : "Kur bilgisi alınamadı.";
  }

  return (
    <main className="checkoutPage">
      <section className="shell pageIntro compact">
        <div>
          <span className="eyebrow dark">Güvenli ödeme</span>
          <h1>Kartla Ödeme</h1>
          <p>
            {order.orderNo} · {order.companyName}
          </p>
        </div>
        <div className="pageIntroActions">
          <a className="btn btnGhost dark" href={`/orders/${encodeURIComponent(order.trackingCode)}`}>
            <ArrowLeft size={17} aria-hidden="true" />
            Siparişe Dön
          </a>
        </div>
      </section>

      <section className="shell checkoutGrid">
        <article className="panel checkoutMain">
          <div className="panelHeader compact">
            <div>
              <h2>{directPost ? "Taksit seçenekleri" : "Ödeme özeti"}</h2>
              <p>
                {directPost
                  ? "Vade farkı dahil tutarlar aşağıdadır. Seçtiğiniz tutar tahsil edilir."
                  : "Tutarı onaylayın; kart bilgileri ve taksit seçimi güvenli ZiraatPay ekranında yapılır."}
              </p>
            </div>
          </div>

          {alreadyPaid ? (
            <div className="cartAlert warning">
              <span>Bu siparişin ödemesi görünüşe göre alınmış. Tekrar ödeme yapmadan önce kontrol edin.</span>
            </div>
          ) : null}

          {fxError ? (
            <p className="formError">Kart ödemesi şu an başlatılamıyor: {fxError}</p>
          ) : directPost ? (
            <InstallmentSelector trackingCode={order.trackingCode} options={options} />
          ) : (
            <PayNowButton
              trackingCode={order.trackingCode}
              amountLabel={formatTry(convertedAmount ?? 0)}
            />
          )}
        </article>

        <aside className="panel checkoutSummary">
          <div className="cartSummaryHeading">
            <span>Sipariş özeti</span>
            <StatusPill tone={orderStatusLabel(order.status).tone}>{orderStatusLabel(order.status).label}</StatusPill>
          </div>

          <div className="checkoutSummaryRows">
            <div>
              <span>Sipariş tutarı (KDV dahil)</span>
              <strong>
                {order.totalAmount} {orderCurrency}
              </strong>
            </div>
            {orderCurrency !== "TRY" && convertedAmount !== null ? (
              <>
                <div>
                  <span>TCMB kuru</span>
                  <strong>{rate.toLocaleString("tr-TR", { maximumFractionDigits: 4 })}</strong>
                </div>
                <div>
                  <span>TL karşılığı</span>
                  <strong>{formatTry(convertedAmount)}</strong>
                </div>
              </>
            ) : null}
            <div>
              <span>Kargo</span>
              <strong>{hasFreeShipping ? "Bizden" : "Sipariş onayında belirlenir"}</strong>
            </div>
            <div>
              <span>Ürün sayısı</span>
              <strong>{order.items.length}</strong>
            </div>
          </div>

          <div className="checkoutItemList">
            {order.items.map((item) => (
              <div key={item.id}>
                <span>
                  <strong>{item.productName}</strong>
                  <small>
                    {item.sku} · {item.quantity} {item.unit}
                  </small>
                </span>
                <span>
                  {item.lineTotal} {item.currency}
                  <small>KDV dahil</small>
                </span>
              </div>
            ))}
          </div>
        </aside>
      </section>
    </main>
  );
}

function parseAmount(value: string): number {
  const parsed = parseFloat(String(value ?? "").replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeEmail(value: string): string {
  return (value || "").trim().toLocaleLowerCase("tr-TR");
}

function formatTry(value: number): string {
  return new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY" }).format(value);
}
