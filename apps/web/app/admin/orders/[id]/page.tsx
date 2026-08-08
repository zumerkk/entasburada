import { notFound } from "next/navigation";
import { Save } from "lucide-react";
import { StatusPill } from "@entas/ui";
import { requireAdmin } from "../../../../lib/admin-auth";
import { ORDER_STATUS_OPTIONS, orderStatusLabel } from "../../../../lib/commercial-labels";
import { getAdminOrderById } from "../../../../lib/commercial-repository";
import { SHIPPING_CARRIERS } from "../../../../lib/shipping-carriers";
import { updateOrderOperationAction } from "../../actions";
import { AdminFrame } from "../../AdminFrame";

const financeStatuses = ["Bekliyor", "Onaylandı", "Reddedildi"];
const stockStatuses = ["Kontrol bekliyor", "Ayrıldı", "Kısmi", "Tedarik bekliyor", "Stok yok"];
const shipmentStatuses = ["Planlanmadi", "Sevkiyata hazır", "Kargoya verildi", "Teslim edildi"];
const warehouses = ["Ana Depo", "Tedarikçi Deposu", "Konsinye", "Dış tedarik"];

export const dynamic = "force-dynamic";

export default async function AdminOrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  const order = await getAdminOrderById(id);

  if (!order) {
    notFound();
  }

  return (
    <AdminFrame active="orders">
      <header className="adminTopbar">
        <div>
          <span>Sipariş detayı</span>
          <h1>{order.orderNo}</h1>
        </div>
        <div className="adminTopActions">
          <a className="btn btnGhost dark" href={`/orders/${encodeURIComponent(order.trackingCode)}`}>
            Müşteri Görünümü
          </a>
          <a className="btn btnGhost dark" href="/admin/orders">
            Siparişlere dön
          </a>
        </div>
      </header>

      <section className="panel detailSummaryGrid">
        <div>
          <span>Firma</span>
          <strong>{order.companyName}</strong>
        </div>
        <div>
          <span>Bayi kullanıcısı</span>
          <strong>{order.dealerUser}</strong>
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
          <span>Stok / sevkiyat</span>
          <strong>
            {order.stockStatus} / {order.shipmentStatus}
          </strong>
        </div>
        <div>
          <span>Tutar</span>
          <strong>
            {order.totalAmount} {order.currency}
          </strong>
        </div>
        <div>
          <span>Takip kodu</span>
          <strong>{order.trackingCode}</strong>
        </div>
        <div>
          <span>Kaynak</span>
          <strong>{order.source}</strong>
        </div>
        <div className="spanTwo">
          <span>Teslimat adresi</span>
          <strong>{order.deliveryAddress}</strong>
        </div>
      </section>

      <section className="panel">
        <div className="panelHeader compact">
          <h2>Ürün satırları</h2>
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
      </section>

      <section className="panel">
        <div className="panelHeader compact">
          <h2>Operasyon güncelle</h2>
        </div>
        <form className="adminFilterForm inlineCommercialForm" action={updateOrderOperationAction}>
          <input type="hidden" name="orderId" value={order.id} />
          <label>
            Durum
            <select name="status" defaultValue={order.status}>
              {ORDER_STATUS_OPTIONS.map((option) => (
                <option value={option.value} key={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Ödeme
            <input name="paymentStatus" defaultValue={order.paymentStatus} />
          </label>
          <label>
            Finans
            <select name="financeApproval" defaultValue={order.financeApproval}>
              {financeStatuses.map((status) => (
                <option value={status} key={status}>
                  {status}
                </option>
              ))}
            </select>
          </label>
          <label>
            Stok
            <select name="stockStatus" defaultValue={order.stockStatus}>
              {stockStatuses.map((status) => (
                <option value={status} key={status}>
                  {status}
                </option>
              ))}
            </select>
          </label>
          <label>
            Sevkiyat
            <select name="shipmentStatus" defaultValue={order.shipmentStatus}>
              {shipmentStatuses.map((status) => (
                <option value={status} key={status}>
                  {status}
                </option>
              ))}
            </select>
          </label>
          <label>
            Kargo firması
            <select name="carrier" defaultValue={order.carrier ?? ""}>
              <option value="">— Seçiniz —</option>
              {SHIPPING_CARRIERS.map((carrier) => (
                <option value={carrier.key} key={carrier.key}>
                  {carrier.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Kargo takip no
            <input name="trackingNumber" defaultValue={order.trackingNumber ?? ""} placeholder="Takip numarası" />
          </label>
          <label>
            Depo
            <select name="warehouse" defaultValue={order.warehouse}>
              {warehouses.map((warehouse) => (
                <option value={warehouse} key={warehouse}>
                  {warehouse}
                </option>
              ))}
            </select>
          </label>
          <label className="spanTwo">
            İç not
            <textarea name="internalNote" defaultValue={order.internalNote} />
          </label>
          <button className="btn btnPrimary" type="submit">
            <Save size={17} aria-hidden="true" />
            Güncelle
          </button>
        </form>
      </section>

      <section className="panel">
        <div className="panelHeader compact">
          <h2>Hareket geçmişi</h2>
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
      </section>
    </AdminFrame>
  );
}
