import { ClipboardList, Search } from "lucide-react";
import { EmptyState, StatusPill } from "@entas/ui";
import { requireAdmin } from "../../../lib/admin-auth";
import { searchAdminOrders } from "../../../lib/commercial-repository";
import { updateOrderOperationAction } from "../actions";
import { AdminFrame } from "../AdminFrame";

type SearchParams = Record<string, string | string[] | undefined>;

const orderStatuses = ["all", "DRAFT", "PAYMENT_PENDING", "APPROVAL_PENDING", "FINANCE_APPROVAL_PENDING", "STOCK_WAITING", "PREPARING", "READY_TO_SHIP", "SHIPPED", "DELIVERED", "CANCELLED", "COMPLETED"];
const financeStatuses = ["all", "Bekliyor", "Onaylandı", "Reddedildi"];
const warehouses = ["all", "Ana Depo", "Tedarikçi Deposu"];

export const dynamic = "force-dynamic";

export default async function AdminOrdersPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requireAdmin();
  const params = await searchParams;
  const q = getParam(params, "q");
  const status = getParam(params, "status") || "all";
  const company = getParam(params, "company");
  const financeApproval = getParam(params, "financeApproval") || "all";
  const warehouse = getParam(params, "warehouse") || "all";
  const dateFrom = getParam(params, "dateFrom");
  const dateTo = getParam(params, "dateTo");
  const page = Math.max(1, Number(getParam(params, "page") || "1"));
  const limit = 25;
  const orders = await searchAdminOrders({ q, status, company, financeApproval, warehouse, dateFrom, dateTo, limit, offset: (page - 1) * limit });
  const safePage = Math.floor(orders.offset / orders.limit) + 1;
  const pageCount = Math.max(1, Math.ceil(orders.total / orders.limit));

  return (
    <AdminFrame active="orders">
      <header className="adminTopbar">
        <div>
          <span>Siparişler</span>
          <h1>Sipariş operasyonu</h1>
        </div>
        <a className="btn btnPrimary" href="/quote">
          <ClipboardList size={17} aria-hidden="true" />
          Yeni Sipariş Oluştur
        </a>
      </header>

      <section className="panel">
        <form className="adminFilterForm ordersFilter" action="/admin/orders">
          <label>
            Arama
            <input name="q" defaultValue={q} placeholder="Sipariş no, firma, bayi" />
          </label>
          <label>
            Durum
            <select name="status" defaultValue={status}>
              {orderStatuses.map((item) => (
                <option value={item} key={item}>
                  {item === "all" ? "Tüm durumlar" : item}
                </option>
              ))}
            </select>
          </label>
          <label>
            Finans onayı
            <select name="financeApproval" defaultValue={financeApproval}>
              {financeStatuses.map((item) => (
                <option value={item} key={item}>
                  {item === "all" ? "Tümü" : item}
                </option>
              ))}
            </select>
          </label>
          <label>
            Depo
            <select name="warehouse" defaultValue={warehouse}>
              {warehouses.map((item) => (
                <option value={item} key={item}>
                  {item === "all" ? "Tüm depolar" : item}
                </option>
              ))}
            </select>
          </label>
          <label>
            Firma
            <input name="company" defaultValue={company} />
          </label>
          <label>
            Başlangıç
            <input name="dateFrom" type="date" defaultValue={dateFrom} />
          </label>
          <label>
            Bitiş
            <input name="dateTo" type="date" defaultValue={dateTo} />
          </label>
          <button className="btn btnGhost dark" type="submit">
            <Search size={17} aria-hidden="true" />
            Filtrele
          </button>
        </form>
      </section>

      <section className="panel">
        <div className="panelHeader">
          <div>
            <h2>{orders.total.toLocaleString("tr-TR")} sipariş</h2>
            <p>Siparişler gerçek ticari veri deposundan okunur; demo satır üretilmez.</p>
          </div>
        </div>
        {orders.items.length > 0 ? (
          <div className="adminTable">
            <div className="adminTableHead orderRows">
              <span>Sipariş</span>
              <span>Firma / Bayi</span>
              <span>Tarih</span>
              <span>Durum</span>
              <span>Finans</span>
              <span>Stok / Sevkiyat</span>
              <span>Tutar</span>
              <span>Adres</span>
              <span>Aksiyon</span>
            </div>
            {orders.items.map((order) => (
              <div className="adminTableRow orderRows" key={order.id}>
                <span>
                  <strong>{order.orderNo}</strong>
                  <small>{order.source}</small>
                </span>
                <span>
                  <strong>{order.companyName}</strong>
                  <small>{order.dealerUser}</small>
                </span>
                <span>{formatDate(order.orderedAt)}</span>
                <span>
                  <StatusPill tone={order.status === "DELIVERED" || order.status === "COMPLETED" ? "success" : order.status === "CANCELLED" ? "danger" : "info"}>{order.status}</StatusPill>
                </span>
                <span>
                  <strong>{order.paymentStatus}</strong>
                  <small>{order.financeApproval}</small>
                </span>
                <span>
                  <strong>{order.stockStatus}</strong>
                  <small>{order.shipmentStatus}</small>
                </span>
                <span>
                  {order.totalAmount} {order.currency}
                </span>
                <span>{order.deliveryAddress}</span>
                <span className="rowActions">
                  <a href={`/admin/orders/${order.id}`}>Detay</a>
                  <form action={updateOrderOperationAction}>
                    <input type="hidden" name="orderId" value={order.id} />
                    <input type="hidden" name="status" value="PREPARING" />
                    <button type="submit" disabled={order.status === "CANCELLED" || order.status === "COMPLETED"}>
                      Hazırlanıyor
                    </button>
                  </form>
                  <form action={updateOrderOperationAction}>
                    <input type="hidden" name="orderId" value={order.id} />
                    <input type="hidden" name="status" value="STOCK_WAITING" />
                    <input type="hidden" name="financeApproval" value="Onaylandı" />
                    <button type="submit" disabled={order.status === "CANCELLED" || order.status === "COMPLETED"}>
                      Finans onayı
                    </button>
                  </form>
                  <form action={updateOrderOperationAction}>
                    <input type="hidden" name="orderId" value={order.id} />
                    <input type="hidden" name="status" value="PREPARING" />
                    <input type="hidden" name="stockStatus" value="Ayrıldı" />
                    <button type="submit" disabled={order.status === "CANCELLED" || order.status === "COMPLETED"}>
                      Stok ayır
                    </button>
                  </form>
                  <form action={updateOrderOperationAction}>
                    <input type="hidden" name="orderId" value={order.id} />
                    <input type="hidden" name="status" value="READY_TO_SHIP" />
                    <input type="hidden" name="shipmentStatus" value="Sevkiyata hazır" />
                    <button type="submit" disabled={order.status === "CANCELLED" || order.status === "COMPLETED"}>
                      Sevkiyat
                    </button>
                  </form>
                </span>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState
            title="Henüz sipariş bulunmuyor."
            body="Bayi siparişleri oluştuğunda finans, stok, sevkiyat ve iade aksiyonlarıyla bu listede görünecek."
            action={
              <a className="btn btnPrimary" href="/quote">
                Yeni Sipariş Oluştur
              </a>
            }
          />
        )}
      </section>

      <nav className="pagination adminPagination" aria-label="Sipariş sayfalama">
        <a className={safePage <= 1 ? "disabled" : ""} href={safePage <= 1 ? "#" : pageHref(params, safePage - 1)}>
          Önceki
        </a>
        <span>
          {safePage.toLocaleString("tr-TR")} / {pageCount.toLocaleString("tr-TR")}
        </span>
        <a className={safePage >= pageCount ? "disabled" : ""} href={safePage >= pageCount ? "#" : pageHref(params, safePage + 1)}>
          Sonraki
        </a>
      </nav>
    </AdminFrame>
  );
}

function getParam(params: SearchParams, key: string): string {
  const value = params[key];
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function pageHref(params: SearchParams, page: number): string {
  const next = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    const scalar = Array.isArray(value) ? value[0] : value;
    if (scalar && key !== "page") {
      next.set(key, scalar);
    }
  }
  next.set("page", String(page));
  return `/admin/orders?${next.toString()}`;
}

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "-" : date.toLocaleDateString("tr-TR");
}
