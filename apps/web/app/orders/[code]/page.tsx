import { notFound } from "next/navigation";
import { StatusPill } from "@entas/ui";
import { getOrderByTrackingCode } from "../../../lib/commercial-repository";

export const dynamic = "force-dynamic";

export default async function OrderTrackingPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const order = await getOrderByTrackingCode(code);

  if (!order) {
    notFound();
  }

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
            <div className="spanTwo">
              <span>Teslimat adresi</span>
              <strong>{order.deliveryAddress}</strong>
            </div>
          </div>

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
