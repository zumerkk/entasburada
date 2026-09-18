import { ClipboardList, Search, Trash2 } from "lucide-react";
import { EmptyState, StatusPill } from "@entas/ui";
import { requireAdmin } from "../../../lib/admin-auth";
import { orderStatusLabel } from "../../../lib/commercial-labels";
import { countAdminOrderViews, searchAdminOrders } from "../../../lib/commercial-repository";
import { orderDeletionBlockReason } from "../../../lib/order-editing";
import { updateOrderOperationAction } from "../actions";
import { AdminFrame } from "../AdminFrame";
import { deleteRejectedOrdersAction } from "./actions";
import { ConfirmSubmitButton } from "./ConfirmSubmitButton";

type SearchParams = Record<string, string | string[] | undefined>;

const orderStatuses = ["all", "DRAFT", "PAYMENT_PENDING", "APPROVAL_PENDING", "DEALER_APPROVAL_PENDING", "FINANCE_APPROVAL_PENDING", "STOCK_WAITING", "PREPARING", "READY_TO_SHIP", "SHIPPED", "DELIVERED", "CANCELLED", "COMPLETED"];
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
  const okMessage = getParam(params, "ok");
  const errorMessage = getParam(params, "error");
  // Reddedilen/iptal siparişler varsayılan listede görünmez; açıkça iptal/red filtrelenirse gösterilir.
  const requestedView = getParam(params, "view");
  const view: "active" | "rejected" | "all" =
    requestedView === "rejected" || requestedView === "all"
      ? requestedView
      : status === "CANCELLED" || financeApproval === "Reddedildi"
        ? "all"
        : "active";
  const limit = 25;
  const [orders, viewCounts] = await Promise.all([
    searchAdminOrders({ q, status, company, financeApproval, warehouse, dateFrom, dateTo, view, limit, offset: (page - 1) * limit }),
    countAdminOrderViews()
  ]);
  const deletableOrders = view === "rejected" ? orders.items.filter((order) => orderDeletionBlockReason(order) === null) : [];
  const safePage = Math.floor(orders.offset / orders.limit) + 1;
  const pageCount = Math.max(1, Math.ceil(orders.total / orders.limit));

  return (
    <AdminFrame active="orders">
      <header className="adminTopbar">
        <div>
          <span>Siparişler</span>
          <h1>Sipariş operasyonu</h1>
        </div>
        <a className="btn btnPrimary" href="/admin/orders/new">
          <ClipboardList size={17} aria-hidden="true" />
          Yeni Sipariş Oluştur
        </a>
      </header>

      <nav className="adminOrderTabs" aria-label="Sipariş görünümü">
        <a href="/admin/orders" className={view === "active" ? "active" : ""}>
          Aktif siparişler <span>{viewCounts.active.toLocaleString("tr-TR")}</span>
        </a>
        <a href="/admin/orders?view=rejected" className={view === "rejected" ? "active" : ""}>
          Reddedilen / iptal <span>{viewCounts.rejected.toLocaleString("tr-TR")}</span>
        </a>
      </nav>
      {okMessage ? <p className="formSuccess">{okMessage}</p> : null}
      {errorMessage ? <p className="formError">{errorMessage}</p> : null}

      <section className="panel">
        <form className="adminFilterForm ordersFilter" action="/admin/orders">
          {view !== "active" ? <input type="hidden" name="view" value={view} /> : null}
          <label>
            Arama
            <input name="q" defaultValue={q} placeholder="Sipariş no, firma, bayi" />
          </label>
          <label>
            Durum
            <select name="status" defaultValue={status}>
              {orderStatuses.map((item) => (
                <option value={item} key={item}>
                  {item === "all" ? "Tüm durumlar" : orderStatusLabel(item).label}
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
            <h2>
              {orders.total.toLocaleString("tr-TR")} {view === "rejected" ? "reddedilen / iptal sipariş" : "sipariş"}
            </h2>
            <p>
              {view === "rejected"
                ? "Silinen siparişler listeden kalkar ve arşive (orders-deleted.json) taşınır. Tahsilatı yapılmış siparişler silinemez."
                : "Reddedilen ve iptal edilen siparişler bu listede gösterilmez; “Reddedilen / iptal” sekmesinden yönetilir."}
            </p>
          </div>
          {deletableOrders.length > 0 ? (
            <form action={deleteRejectedOrdersAction}>
              {deletableOrders.map((order) => (
                <input type="hidden" name="orderId" value={order.id} key={order.id} />
              ))}
              <ConfirmSubmitButton
                className="btn btnDanger"
                message={`Bu sayfadaki ${deletableOrders.length} reddedilen/iptal sipariş listeden silinsin mi? Kayıtlar arşive taşınır.`}
              >
                <Trash2 size={16} aria-hidden="true" /> Bu sayfadakileri sil ({deletableOrders.length.toLocaleString("tr-TR")})
              </ConfirmSubmitButton>
            </form>
          ) : null}
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
                  <StatusPill tone={orderStatusLabel(order.status).tone}>{orderStatusLabel(order.status).label}</StatusPill>
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
                  {view === "rejected" ? (
                    orderDeletionBlockReason(order) === null ? (
                      <form action={deleteRejectedOrdersAction}>
                        <input type="hidden" name="orderId" value={order.id} />
                        <ConfirmSubmitButton message={`${order.orderNo} listeden silinsin mi? Kayıt arşive taşınır.`}>Sil</ConfirmSubmitButton>
                      </form>
                    ) : (
                      <small title={orderDeletionBlockReason(order) ?? ""}>Silinemez</small>
                    )
                  ) : (
                    <>
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
                    </>
                  )}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState
            title={view === "rejected" ? "Reddedilen veya iptal edilen sipariş yok." : "Henüz sipariş bulunmuyor."}
            body={
              view === "rejected"
                ? "Finans reddi, firma içi red veya iptal durumundaki siparişler burada listelenir."
                : "Bayi siparişleri oluştuğunda finans, stok, sevkiyat ve iade aksiyonlarıyla bu listede görünecek."
            }
            action={
              <a className="btn btnPrimary" href="/admin/orders/new">
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
