import { notFound } from "next/navigation";
import { requireAdmin } from "../../../../../lib/admin-auth";
import { getBrandSettings } from "../../../../../lib/brand-settings";
import { orderStatusLabel } from "../../../../../lib/commercial-labels";
import { getAdminOrderById } from "../../../../../lib/commercial-repository";
import { COMPANY_CONTACT } from "../../../../../lib/company-contact";
import { getCarrier } from "../../../../../lib/shipping-carriers";
import { PrintButton } from "./PrintButton";

export const dynamic = "force-dynamic";

/**
 * Kargo kutusuna konulacak sevk fisi.
 *
 * Ayri bir PDF kutuphanesi yerine yazdirmaya optimize HTML kullanilir: hedef
 * zaten cikti almak ve tarayicinin yazdirma diyalogu "PDF olarak kaydet"
 * seceneğini kendisi sunuyor. Boylece Turkce karakterlerde font gomme sorunu
 * yasanmıyor ve yeni bir bagimlilik eklenmiyor.
 */
export default async function OrderPackingSlipPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  const [order, brand] = await Promise.all([getAdminOrderById(id), getBrandSettings()]);

  if (!order) {
    notFound();
  }

  const status = orderStatusLabel(order.status);
  const carrierLabel = getCarrier(order.carrier)?.label;
  const orderedAt = new Date(order.orderedAt);
  const printedAt = new Date();

  return (
    <main className="packingSlipPage">
      <div className="packingSlipToolbar">
        <a className="btn btnGhost dark" href={`/admin/orders/${order.id}`}>
          Sipariş detayına dön
        </a>
        <PrintButton />
      </div>

      <article className="packingSlip">
        <header className="packingSlipHead">
          <div className="packingSlipBrand">
            {brand.headerLogoUrl ? <img src={brand.headerLogoUrl} alt="" /> : null}
            <div>
              <strong>{brand.siteTitle || brand.siteName}</strong>
              <span>{COMPANY_CONTACT.address}</span>
              <span>
                {COMPANY_CONTACT.technicalSupportPhone} · {COMPANY_CONTACT.supportEmail}
              </span>
            </div>
          </div>
          <div className="packingSlipMeta">
            <h1>SEVK FİŞİ</h1>
            <dl>
              <div>
                <dt>Sipariş no</dt>
                <dd>{order.orderNo}</dd>
              </div>
              <div>
                <dt>Sipariş tarihi</dt>
                <dd>{Number.isNaN(orderedAt.getTime()) ? "-" : orderedAt.toLocaleDateString("tr-TR")}</dd>
              </div>
              <div>
                <dt>Takip kodu</dt>
                <dd>{order.trackingCode}</dd>
              </div>
            </dl>
          </div>
        </header>

        <section className="packingSlipParties">
          <div>
            <span className="packingSlipLabel">Gönderen</span>
            <strong>{brand.siteTitle || brand.siteName}</strong>
            <p>{COMPANY_CONTACT.address}</p>
            <p>{COMPANY_CONTACT.technicalSupportPhone}</p>
          </div>
          <div>
            <span className="packingSlipLabel">Alıcı</span>
            <strong>{order.companyName}</strong>
            <p>{order.dealerUser}</p>
            <p>{order.deliveryAddress}</p>
            <p>
              {order.phone}
              {order.email ? ` · ${order.email}` : ""}
            </p>
          </div>
        </section>

        <table className="packingSlipTable">
          <thead>
            <tr>
              <th className="colIndex">#</th>
              <th>Ürün</th>
              <th className="colNum">Adet</th>
              <th className="colNum">Birim fiyat</th>
              <th className="colNum">Tutar</th>
            </tr>
          </thead>
          <tbody>
            {order.items.map((item, index) => (
              <tr key={item.id}>
                <td className="colIndex">{index + 1}</td>
                <td>
                  <strong>{item.productName}</strong>
                  <small>
                    {item.sku}
                    {item.brand ? ` · ${item.brand}` : ""}
                  </small>
                </td>
                <td className="colNum">
                  {item.quantity} {item.unit}
                </td>
                <td className="colNum">
                  {item.unitPrice} {item.currency}
                </td>
                <td className="colNum">
                  {item.lineTotal} {item.currency}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={3} />
              <th className="colNum">Genel toplam</th>
              <td className="colNum packingSlipTotal">
                {order.totalAmount} {order.currency}
              </td>
            </tr>
          </tfoot>
        </table>

        <section className="packingSlipInfoGrid">
          <div>
            <span className="packingSlipLabel">Ödeme</span>
            <p>
              <strong>{order.paymentStatus || "-"}</strong>
            </p>
            <p>Finans onayı: {order.financeApproval || "-"}</p>
          </div>
          <div>
            <span className="packingSlipLabel">Sipariş durumu</span>
            <p>
              <strong>{status.label}</strong>
            </p>
            <p>{status.hint}</p>
          </div>
          <div>
            <span className="packingSlipLabel">Kargo</span>
            <p>
              <strong>{carrierLabel ?? "Belirlenmedi"}</strong>
            </p>
            <p>{order.trackingNumber ? `Takip no: ${order.trackingNumber}` : "Takip numarası girilmedi"}</p>
          </div>
          <div>
            <span className="packingSlipLabel">Depo / kaynak</span>
            <p>
              <strong>{order.warehouse || "-"}</strong>
            </p>
            <p>{order.source || "-"}</p>
          </div>
        </section>

        {order.customerNote ? (
          <section className="packingSlipNote">
            <span className="packingSlipLabel">Müşteri notu</span>
            <p>{order.customerNote}</p>
          </section>
        ) : null}

        <section className="packingSlipSignatures">
          <div>
            <span>Teslim eden</span>
            <em>Ad soyad / imza</em>
          </div>
          <div>
            <span>Teslim alan</span>
            <em>Ad soyad / imza</em>
          </div>
        </section>

        <footer className="packingSlipFoot">
          <span>
            {order.orderNo} · {order.trackingCode}
          </span>
          <span>Yazdırma: {printedAt.toLocaleString("tr-TR")}</span>
        </footer>
      </article>
    </main>
  );
}
