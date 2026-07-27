import { notFound } from "next/navigation";
import { StatusPill } from "@entas/ui";
import { getOrderByTrackingCode } from "../../../lib/commercial-repository";
import { PayWithCardButton } from "../../../components/PayWithCardButton";
import { reorderAction } from "../../cart/actions";
import { buildTrackingUrl, getCarrier } from "../../../lib/shipping-carriers";

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
  const order = await getOrderByTrackingCode(code);

  if (!order) {
    notFound();
  }

  const trackingUrl = buildTrackingUrl(order.carrier, order.trackingNumber);
  const carrierLabel = getCarrier(order.carrier)?.label;

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
              <StatusPill tone={order.status === "CANCELLED" ? "danger" : order.status === "COMPLETED" || order.status === "DELIVERED" ? "success" : "info"}>
                {order.status}
              </StatusPill>
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
              <span>Toplam</span>
              <strong>
                {order.totalAmount} {order.currency}
              </strong>
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
            <PayWithCardButton trackingCode={order.trackingCode} />
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
