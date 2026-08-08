import { notFound } from "next/navigation";
import { orderStatusLabel } from "../../../lib/commercial-labels";
import { StatusPill } from "@entas/ui";
import { getOrderByTrackingCode } from "../../../lib/commercial-repository";
import { reorderAction } from "../../cart/actions";
import { buildTrackingUrl, getCarrier } from "../../../lib/shipping-carriers";
import { convertToTry, normalizeCurrencyCode } from "../../../lib/fx";
import { installmentOptions } from "../../../lib/installments";
import { getCurrentCustomer } from "../../../lib/customer-auth";
import { canAccessCommercialRecord } from "../../../lib/commercial-access";
import { FREE_SHIPPING_THRESHOLD_TRY } from "../../../lib/commercial-policy";

export const dynamic = "force-dynamic";

const PAYMENT_NOTICE: Record<string, { tone: string; text: string }> = {
  success: { tone: "success", text: "Ödemeniz alındı. Teşekkürler." },
  failed: { tone: "danger", text: "Ödeme tamamlanamadı. Lütfen tekrar deneyin." },
  invalid: { tone: "danger", text: "Ödeme doğrulanamadı. Bir sorun oluştuysa bizimle iletişime geçin." },
  notfound: { tone: "danger", text: "Sipariş bulunamadı." }
};

export default async function OrderTrackingPage({
  params,
  searchParams
}: {
  params: Promise<{ code: string }>;
  searchParams: Promise<{ payment?: string; reorder?: string }>;
}) {
  const { code } = await params;
  const { payment, reorder } = await searchParams;
  const [order, customer] = await Promise.all([getOrderByTrackingCode(code), getCurrentCustomer()]);

  if (!order || !canAccessCommercialRecord(order, customer)) {
    notFound();
  }

  const trackingUrl = buildTrackingUrl(order.carrier, order.trackingNumber);
  const carrierLabel = getCarrier(order.carrier)?.label;
  const hasFreeShipping = normalizeCurrencyCode(order.currency) === "TRY" && parseAmount(order.totalAmount) >= FREE_SHIPPING_THRESHOLD_TRY;

  // Tahsilat TRY yapılır. USD/EUR sipariş için TCMB kuruyla çevrilen tutarı ve
  // taksit seçeneklerini hazırla. Kur alınamazsa ödeme gösterilmez (yanlış tutar riski).
  const orderCurrency = normalizeCurrencyCode(order.currency);
  let paymentPlan: { options: ReturnType<typeof installmentOptions>; note?: string } | null = null;
  let paymentError: string | null = null;
  if (order.status === "PAYMENT_PENDING") {
    try {
      const charge = await convertToTry(parseAmount(order.totalAmount), orderCurrency);
      paymentPlan = {
        options: installmentOptions(charge.amount),
        ...(orderCurrency !== "TRY"
          ? {
              note: `Sipariş ${order.totalAmount} ${orderCurrency} · TCMB kuru ${charge.rate.toLocaleString("tr-TR", { maximumFractionDigits: 4 })} ile ${formatTryAmount(charge.amount)} olarak tahsil edilir.`
            }
          : {})
      };
    } catch (error) {
      paymentError = error instanceof Error ? error.message : "Kur bilgisi alınamadı.";
    }
  }

  const notice = payment
    ? PAYMENT_NOTICE[payment]
    : reorder === "empty"
      ? { tone: "danger", text: "Bu siparişte sepete eklenecek ürün bulunamadı." }
      : reorder === "error"
        ? { tone: "danger", text: "Ürünler sepete eklenemedi. Lütfen tekrar deneyin." }
        : undefined;

  return (
    <main>
      <section className="shell pageIntro">
        <div>
          <span className="eyebrow dark">Sipariş takibi</span>
          <h1>{order.orderNo}</h1>
          <p>{order.companyName} sipariş operasyon durumu.</p>
        </div>
      </section>

      <section className="shell trackingGrid">
        <article className="panel trackingDetail">
          <div className="detailSummaryGrid">
            <div>
              <span>Takip kodu</span>
              <strong>{order.trackingCode}</strong>
            </div>
            <div>
              <span>Durum</span>
              <StatusPill tone={orderStatusLabel(order.status).tone}>{orderStatusLabel(order.status).label}</StatusPill>
              <small className="detailStatusHint">{orderStatusLabel(order.status).hint}</small>
            </div>
            <div>
              <span>Finans</span>
              <strong>{order.financeApproval}</strong>
            </div>
            <div>
              <span>Stok</span>
              <strong>{order.stockStatus}</strong>
            </div>
            <div>
              <span>Sevkiyat</span>
              <strong>{order.shipmentStatus}</strong>
            </div>
            <div>
              <span>KDV dahil toplam</span>
              <strong>
                {order.totalAmount} {order.currency}
              </strong>
            </div>
            <div>
              <span>Kargo</span>
              <strong>{hasFreeShipping ? "Bizden" : "Sipariş onayında belirlenir"}</strong>
            </div>
            {order.trackingNumber ? (
              <div className="spanTwo">
                <span>Kargo takip</span>
                <strong>
                  {carrierLabel ? `${carrierLabel} · ` : ""}
                  {trackingUrl ? (
                    <a href={trackingUrl} target="_blank" rel="noopener noreferrer">
                      {order.trackingNumber} ↗
                    </a>
                  ) : (
                    order.trackingNumber
                  )}
                </strong>
              </div>
            ) : null}
            <div className="spanTwo">
              <span>Teslimat adresi</span>
              <strong>{order.deliveryAddress}</strong>
            </div>
          </div>

          {notice ? (
            <StatusPill tone={notice.tone === "success" ? "success" : "danger"}>{notice.text}</StatusPill>
          ) : null}

          {order.status === "PAYMENT_PENDING" ? (
            <div className="payWithCard">
              {paymentPlan?.note ? <p className="installmentNote">{paymentPlan.note}</p> : null}
              <a className="btn btnPrimary" href={`/checkout/${encodeURIComponent(order.trackingCode)}`}>
                Kartla Öde
              </a>
              <span className="reorderHint">Taksit seçenekleri ödeme adımında görüntülenir.</span>
            </div>
          ) : null}
          {paymentError ? (
            <p className="formError">Kart ödemesi şu an başlatılamıyor: {paymentError}</p>
          ) : null}

          <form action={reorderAction} className="reorderForm">
            <input type="hidden" name="trackingCode" value={order.trackingCode} />
            <button type="submit" className="btn btnSecondary">
              Yeniden Sipariş Ver
            </button>
            <span className="reorderHint">Bu siparişin tüm ürünlerini sepete ekler.</span>
          </form>

          <div className="commercialTable">
            <div className="commercialTableHead orderItemRows">
              <span>Ürün</span>
              <span>Adet</span>
              <span>Birim fiyat</span>
              <span>Tutar</span>
            </div>
            {order.items.map((item) => (
              <div className="commercialTableRow orderItemRows" key={item.id}>
                <span>
                  <strong>{item.productName}</strong>
                  <small>{item.sku}</small>
                </span>
                <span>
                  {item.quantity} {item.unit}
                </span>
                <span>
                  {item.unitPrice} {item.currency}
                  <small>KDV dahil</small>
                </span>
                <span>
                  {item.lineTotal} {item.currency}
                </span>
              </div>
            ))}
          </div>

          <div className="commercialTimeline">
            {order.history.map((entry) => (
              <div key={entry.id}>
                <strong>{entry.message}</strong>
                <span>
                  {entry.actorName} · {new Date(entry.at).toLocaleString("tr-TR")}
                </span>
              </div>
            ))}
          </div>
        </article>
      </section>
    </main>
  );
}

function parseAmount(value: string): number {
  const parsed = parseFloat(String(value ?? "").replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatTryAmount(value: number): string {
  return new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY" }).format(value);
}
