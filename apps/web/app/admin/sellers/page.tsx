import { requireAdmin } from "../../../lib/admin-auth";
import { getCustomers, sellerReferenceCode } from "../../../lib/customer-auth";
import { loadCommercialRecordsForAnalytics } from "../../../lib/commercial-repository";
import { commissionSummary } from "../../../lib/seller-commission";
import { commissionMoney } from "../../../lib/seller-dashboard";
import { AdminFrame } from "../AdminFrame";
import { commissionAction } from "./actions";
export const dynamic = "force-dynamic";
export default async function SellersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdmin();
  const [customers, records, params] = await Promise.all([
    getCustomers(),
    loadCommercialRecordsForAnalytics(),
    searchParams,
  ]);
  const sellers = customers.filter(
    (c) => c.sellerAccess?.enabled && (c.companyId ?? c.id) === c.id,
  );
  const sellerId = String(params.seller ?? "");
  const orders = records.orders
    .filter(
      (o) =>
        o.sellerCommission &&
        (!sellerId || o.sellerCommission.referral.sellerId === sellerId),
    )
    .sort((a, b) => b.orderedAt.localeCompare(a.orderedAt));
  const page = Math.max(
    1,
    Math.min(
      Math.ceil(orders.length / 30) || 1,
      Number.parseInt(String(params.page ?? "1")) || 1,
    ),
  );
  return (
    <AdminFrame active="sellers">
      <header className="adminTopbar">
        <div>
          <span>Satış ortaklığı</span>
          <h1>Satıcılar ve komisyonlar</h1>
          <a href="/admin/dealers">Bayi hesapları ve yeni satıcı oluşturma →</a>
        </div>
      </header>
      {params.error ? (
        <p role="alert" className="referralAlert">
          {String(params.error)}
        </p>
      ) : null}
      {params.ok ? <p role="status">Komisyon işlemi kaydedildi.</p> : null}
      <section className="panel">
        <h2>Satıcı hesapları</h2>
        <p>
          Yeni satıcıyı Bayi yönetiminden açın ve satıcı erişimini
          etkinleştirin. Referans kodu otomatik oluşur.
        </p>
        <div className="referralTableWrap">
          <table className="referralTable">
            <thead>
              <tr>
                <th>Yetkili paneli</th>
                <th>Referans</th>
                <th>Müşteri</th>
                <th>Durum</th>
              </tr>
            </thead>
            <tbody>
              {sellers.map((s) => (
                <tr key={s.id}>
                  <td>
                    <a href={`?seller=${encodeURIComponent(s.id)}`}>
                      {s.authorizedPerson}
                    </a>
                    <small>{s.companyName}</small>
                  </td>
                  <td>{sellerReferenceCode(s)}</td>
                  <td>
                    {
                      customers.filter((c) => c.referral?.sellerId === s.id)
                        .length
                    }
                  </td>
                  <td>{s.status === "approved" ? "Aktif" : "Pasif"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!sellers.length ? <p>Henüz satıcı hesabı yok.</p> : null}
      </section>
      <section className="panel">
        <h2>Komisyon mutabakatı</h2>
        <p>
          Ödemeye uygunluk: sipariş Teslim edildi / Tamamlandı, ödeme durumu
          “Ödendi”, “Tahsil edildi” veya “PAID”. Banka transferini yaptıktan
          sonra dekont referansını girin. Buradaki kayıt banka transferi
          başlatmaz.
        </p>
        <form className="adminFilterForm">
          <label>
            Satıcı
            <select name="seller" defaultValue={sellerId}>
              <option value="">Tüm satıcılar</option>
              {sellers.map((s) => (
                <option value={s.id} key={s.id}>
                  {s.authorizedPerson}
                </option>
              ))}
            </select>
          </label>
          <button className="btn btnPrimary">Filtrele</button>
        </form>
        {orders.slice((page - 1) * 30, page * 30).map((order) => {
          const c = order.sellerCommission!;
          const summary = commissionSummary(
            c,
            order.status,
            order.paymentStatus,
          );
          const hidden = (
            <>
              <input type="hidden" name="orderId" value={order.id} />
              <input type="hidden" name="revision" value={c.revision} />
            </>
          );
          return (
            <details key={order.id} className="referralOrder">
              <summary>
                <span>
                  <strong>
                    {order.orderNo} · Yetkili Panel: {c.referral.sellerName}
                  </strong>
                  <small>{order.companyName}</small>
                </span>
                <strong>
                  {commissionMoney(summary.earnedCents, order.currency)}
                </strong>
              </summary>
              <p>
                <a href={`/admin/orders/${order.id}`}>
                  Sipariş ve tahsilat detayları →
                </a>
              </p>
              <p>
                Ödenebilir:{" "}
                {commissionMoney(summary.payableCents, order.currency)} ·
                Ödenen: {commissionMoney(c.paidCents, order.currency)} · Geri
                alınacak:{" "}
                {commissionMoney(summary.recoveryCents, order.currency)}
              </p>
              {summary.payableCents > 0 ? (
                <form action={commissionAction} className="adminFilterForm">
                  {hidden}
                  <input type="hidden" name="operation" value="settle" />
                  <label>
                    Dekont referansı
                    <input
                      name="reference"
                      required
                      minLength={3}
                      maxLength={160}
                    />
                  </label>
                  <button className="btn btnPrimary">
                    Komisyonu ödendi olarak kaydet
                  </button>
                </form>
              ) : null}
              {summary.recoveryCents > 0 ? (
                <form action={commissionAction} className="adminFilterForm">
                  {hidden}
                  <input type="hidden" name="operation" value="recover" />
                  <label>
                    Geri tahsilat dekontu
                    <input
                      name="reference"
                      required
                      minLength={3}
                      maxLength={160}
                    />
                  </label>
                  <button className="btn btnPrimary">
                    Geri tahsil edildi olarak kaydet
                  </button>
                </form>
              ) : null}
              <h3>Ürün bazında iade</h3>
              <p>
                Yalnızca onaylanmış iadeleri girin. Adet, ürünün bugüne kadarki
                toplam iadesidir.
              </p>
              {c.lines.map((line) => (
                <form
                  action={commissionAction}
                  key={line.itemId}
                  className="adminFilterForm"
                >
                  {hidden}
                  <input type="hidden" name="operation" value="refund" />
                  <input type="hidden" name="itemId" value={line.itemId} />
                  <label>
                    {line.productName} ({line.quantity} adet)
                    <input
                      type="number"
                      name="quantity"
                      min={line.refundedQuantity}
                      max={line.quantity}
                      step="1"
                      defaultValue={line.refundedQuantity}
                      required
                    />
                  </label>
                  <label>
                    İade belge numarası
                    <input
                      name="reference"
                      minLength={3}
                      maxLength={160}
                      required
                    />
                  </label>
                  <button className="btn btnGhost dark">İadeyi işle</button>
                </form>
              ))}
              {c.payments.length ? (
                <>
                  <h3>Ödeme geçmişi</h3>
                  {c.payments.map((p, i) => (
                    <p key={i}>
                      {new Date(p.at).toLocaleString("tr-TR")} ·{" "}
                      {commissionMoney(p.amountCents, order.currency)} ·{" "}
                      {p.reference} · {p.actor}
                    </p>
                  ))}
                </>
              ) : null}
            </details>
          );
        })}
        {!orders.length ? (
          <div className="sellerEmpty">Komisyon içeren sipariş henüz yok.</div>
        ) : null}
        <nav className="pagination">
          {page > 1 ? (
            <a
              href={`?seller=${encodeURIComponent(sellerId)}&page=${page - 1}`}
            >
              Önceki
            </a>
          ) : null}
          <span>
            {page} / {Math.ceil(orders.length / 30) || 1}
          </span>
          {page * 30 < orders.length ? (
            <a
              href={`?seller=${encodeURIComponent(sellerId)}&page=${page + 1}`}
            >
              Sonraki
            </a>
          ) : null}
        </nav>
      </section>
    </AdminFrame>
  );
}
