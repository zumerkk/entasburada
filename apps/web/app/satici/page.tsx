import { approveOwnDealerAction } from "./actions";
import { ownDealerCredentials } from "../../lib/seller-approval";
import {
  Users,
  Wallet,
  Clock3,
  ArrowUpRight,
  Plus,
  Store,
  ReceiptText,
  CircleCheck,
  Search,
} from "lucide-react";
import { SellerReference } from "../../components/SellerReference";
import { sellerReferenceCode } from "../../lib/customer-auth";
import {
  requireReferralSeller,
  sellerDashboard,
  commissionMoney,
} from "../../lib/seller-dashboard";
import { commissionSummary } from "../../lib/seller-commission";

export const dynamic = "force-dynamic";
type Params = Record<string, string | string[] | undefined>;
export default async function SellerDashboardPage({
  searchParams,
}: {
  searchParams: Promise<Params>;
}) {
  const seller = await requireReferralSeller();
  const data = await sellerDashboard(seller.id);
  const params = await searchParams;
  const q = String(params.q ?? "").slice(0, 120);
  const query = q.toLocaleLowerCase("tr-TR");
  const customers = data.applications.filter((c) =>
    [c.companyTitle, c.authorizedPerson, c.email].some((v) =>
      v.toLocaleLowerCase("tr-TR").includes(query),
    ),
  );
  const page = Math.max(
    1,
    Math.min(
      Math.ceil(customers.length / 15) || 1,
      Number.parseInt(String(params.page ?? "1"), 10) || 1,
    ),
  );
  const credentials = new Map(await Promise.all(customers.slice((page - 1) * 15, page * 15).map(async c => [c.id, await ownDealerCredentials(c, seller.id)] as const)));
  const balances = Object.entries(data.totals);
  const total = (field: "pending" | "payable" | "paid") =>
    balances.length
      ? balances
          .map(([currency, value]) => commissionMoney(value[field], currency))
          .join(" · ")
      : commissionMoney(0);
  return (
    <main className="sellerPortal referralPortal">
      <section className="sellerHero">
        <div className="shell referralHeroInner">
          <div>
            <span className="sellerEyebrow">
              <Store size={15} /> ENTAŞBURADA · SATIŞ ORTAKLIĞI
            </span>
            <h1>Yetkili Panel: {seller.authorizedPerson}</h1>
            <p>
              Müşteri ağınızı büyütün.
              <br />
              Her ürün satışından <b>%10 pay</b> kazanın.
            </p>
            <div className="referralHeroActions">
              <a className="btn btnPrimary" href="/satici/musteri">
                <Plus size={18} /> Yeni müşteri kaydet
              </a>
              <a href="#kazanclar">
                Kazançlarımı incele <ArrowUpRight size={17} />
              </a>
            </div>
          </div>
          <SellerReference code={sellerReferenceCode(seller)} />
        </div>
      </section>
      <nav className="shell sellerQuickNav" aria-label="Yetkili menüsü">
        <a href="/satici">
          <Store size={18} /> Genel bakış
        </a>
        <a href="#musteriler">
          <Users size={18} /> Müşterilerim
        </a>
        <a href="#kazanclar">
          <Wallet size={18} /> Kazançlarım
        </a>
        <a
          href={
            seller.sellerAccess?.mode === "referral"
              ? "/catalog"
              : "/satici/katalog"
          }
        >
          <ReceiptText size={18} /> Ürün kataloğu
        </a>
        <a href="/account">
          Hesap ayarları <ArrowUpRight size={16} />
        </a>
      </nav>
      {params.error ? (
        <p className="shell referralAlert" role="alert">
          {String(params.error)}
        </p>
      ) : null}
      {params.approved ? <p className="shell sellerSuccessNotice" role="status">Bayi onaylandı. Müşteri satırındaki “Giriş bilgilerini göster” bölümünden e-posta ve geçici şifreyi alabilirsiniz.</p> : null}
      {params.submitted ? (
        <p className="shell sellerSuccessNotice" role="status">
          <CircleCheck size={20} /> Müşteri kaydı alındı. Başvuru:{" "}
          {String(params.submitted)}. Müşterilerim bölümünden başvuruyu onaylayabilirsiniz.
        </p>
      ) : null}
      {params.passwordChanged ? (
        <p className="shell sellerSuccessNotice" role="status">
          Şifreniz güncellendi. Yetkili paneliniz hazır.
        </p>
      ) : null}
      <section className="shell sellerStats referralStats">
        <div>
          <Users size={20} />
          <span>Kayıtlı müşteri</span>
          <strong>{data.customers.length}</strong>
          <small>
            {
              data.applications.filter(
                (a) => a.status === "pending" || a.status === "reviewing",
              ).length
            }{" "}
            başvuru onay bekliyor
          </small>
        </div>
        <div>
          <Clock3 size={20} />
          <span>Bekleyen kazanç</span>
          <strong>{total("pending")}</strong>
          <small>Tahsilat ve teslimat sonrası kesinleşir</small>
        </div>
        <div>
          <Wallet size={20} />
          <span>Ödenebilir kazanç</span>
          <strong>{total("payable")}</strong>
          <small>Tahsil edilmiş ve teslim edilmiş satışlar</small>
        </div>
        <div>
          <CircleCheck size={20} />
          <span>Ödenen komisyon</span>
          <strong>{total("paid")}</strong>
          <small>Yönetici tarafından kaydedilen ödemeler</small>
        </div>
      </section>
      {balances.some(([, b]) => b.recovery > 0) ? (
        <p className="shell referralAlert">
          İptal/iade sonrası geri alınacak komisyon:{" "}
          {balances
            .filter(([, b]) => b.recovery > 0)
            .map(([c, b]) => commissionMoney(b.recovery, c))
            .join(" · ")}
          . Mutabakat için satış ekibiyle iletişime geçin.
        </p>
      ) : null}
      <section className="shell referralHow">
        <div>
          <b>01</b>
          <span>
            <strong>Müşterinizi ekleyin</strong>
            <small>Panelden kayıt açın veya referansınızı paylaşın.</small>
          </span>
        </div>
        <div>
          <b>02</b>
          <span>
            <strong>Müşteriniz alışveriş yapsın</strong>
            <small>Onaylı hesabının ürün satışları size bağlansın.</small>
          </span>
        </div>
        <div>
          <b>03</b>
          <span>
            <strong>%10 kazancınızı takip edin</strong>
            <small>Ürün bazında şeffaf komisyon dökümü.</small>
          </span>
        </div>
      </section>
      <section className="shell sellerWorkspace" id="musteriler">
        <div className="sellerSectionHead">
          <div>
            <span>MÜŞTERİ AĞINIZ</span>
            <h2>Birlikte büyüdüğünüz işletmeler</h2>
            <p>Kayıtlarınız, başvuru durumları ve müşteri kaynakları.</p>
          </div>
          <a className="btn btnPrimary" href="/satici/musteri">
            <Plus size={17} /> Müşteri ekle
          </a>
        </div>
        <form className="sellerProductFilters">
          <label>
            <Search size={17} />
            <input
              name="q"
              defaultValue={q}
              placeholder="Firma, yetkili veya e-posta ara"
              aria-label="Müşteri ara"
            />
          </label>
          <button className="btn btnGhost dark">Ara</button>
        </form>
        <div className="referralTableWrap">
          <table className="referralTable">
            <thead>
              <tr>
                <th>Müşteri / firma</th>
                <th>İletişim</th>
                <th>Kayıt kanalı</th>
                <th>Durum</th>
                <th>Kayıt tarihi</th>
                <th>Onay / giriş bilgileri</th>
              </tr>
            </thead>
            <tbody>
              {customers.slice((page - 1) * 15, page * 15).map((c) => (
                <tr key={c.id}>
                  <td>
                    <strong>{c.companyTitle}</strong>
                    <small>{c.authorizedPerson}</small>
                  </td>
                  <td>
                    {c.email}
                    <small>{c.phone}</small>
                  </td>
                  <td>
                    {c.referral?.source === "seller"
                      ? "Panelden kayıt"
                      : "Referans kodu"}
                  </td>
                  <td>
                    <span className={`referralBadge ${c.status}`}>
                      {
                        {
                          pending: "Onay bekliyor",
                          reviewing: "İnceleniyor",
                          approved: "Onaylandı",
                          rejected: "Reddedildi",
                        }[c.status]
                      }
                    </span>
                  </td>
                  <td>{new Date(c.createdAt).toLocaleDateString("tr-TR")}</td>
                  <td>
                    {c.status !== "rejected" && (c.status !== "approved" || !c.accountId) ? (
                      <form action={approveOwnDealerAction}>
                        <input type="hidden" name="applicationId" value={c.id} />
                        <button className="btn btnPrimary" type="submit">{c.status === "approved" ? "Hesap oluşturmayı tamamla" : "Bayiyi onayla"}</button>
                      </form>
                    ) : null}
                    {credentials.get(c.id) ? <details>
                      <summary>Giriş bilgilerini göster</summary>
                      <p>E-posta: {credentials.get(c.id)!.email}</p>
                      <p>Geçici şifre: <code>{credentials.get(c.id)!.password}</code></p>
                      <p>Giriş: <a href="/login">entasburada.com/login</a></p>
                      <small>Müşteri ilk girişte şifresini değiştirir. Sonrasında şifresi burada gösterilmez.</small>
                    </details> : c.status === "approved" ? <small>Hesap etkin. Geçici şifre artık gösterilemiyor.</small> : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!customers.length ? (
          <div className="sellerEmpty">
            <Users size={28} />
            <h3>
              {q
                ? "Aramanıza uygun müşteri bulunamadı"
                : "İlk müşterinizle başlayın"}
            </h3>
            <p>
              Müşteri kaydedin veya yukarıdaki referans bağlantınızı paylaşın.
            </p>
          </div>
        ) : null}
        <nav className="pagination" aria-label="Müşteri sayfaları">
          {page > 1 ? (
            <a href={`?q=${encodeURIComponent(q)}&page=${page - 1}#musteriler`}>
              Önceki
            </a>
          ) : null}
          <span>
            {page} / {Math.ceil(customers.length / 15) || 1}
          </span>
          {page * 15 < customers.length ? (
            <a href={`?q=${encodeURIComponent(q)}&page=${page + 1}#musteriler`}>
              Sonraki
            </a>
          ) : null}
        </nav>
      </section>
      <section className="shell sellerWorkspace" id="kazanclar">
        <div className="sellerSectionHead">
          <div>
            <span>SATIŞ & KOMİSYON</span>
            <h2>Kazancınızın her adımı görünür</h2>
            <p>Ürün satış tutarının %10’u · Kargo hariç · İadeler düşülür</p>
          </div>
          <a className="btn btnGhost dark" href="/api/seller/commissions">
            CSV indir
          </a>
        </div>
        {data.orders.length ? (
          data.orders.slice(0, 100).map((order) => {
            const c = order.sellerCommission!;
            const summary = commissionSummary(
              c,
              order.status,
              order.paymentStatus,
            );
            return (
              <details className="referralOrder" key={order.id}>
                <summary>
                  <span>
                    <strong>{order.orderNo}</strong>
                    <small>
                      {order.companyName} ·{" "}
                      {new Date(order.orderedAt).toLocaleDateString("tr-TR")}
                    </small>
                  </span>
                  <span className="referralBadge">
                    {summary.cancelled
                      ? "İptal / iade"
                      : summary.recoveryCents
                        ? "İade mutabakatı"
                        : summary.payableCents
                          ? "Ödenebilir"
                          : summary.pendingCents
                            ? "Bekliyor"
                            : c.paidCents
                              ? "Ödendi"
                              : "Kazanç yok"}
                  </span>
                  <strong>
                    {commissionMoney(summary.earnedCents, order.currency)}
                  </strong>
                </summary>
                <div className="referralTableWrap">
                  <table className="referralTable">
                    <thead>
                      <tr>
                        <th>Ürün</th>
                        <th>Adet / iade</th>
                        <th>Satış tutarı</th>
                        <th>%10 payınız</th>
                      </tr>
                    </thead>
                    <tbody>
                      {c.lines.map((line) => (
                        <tr key={line.itemId}>
                          <td>{line.productName}</td>
                          <td>
                            {line.quantity} / {line.refundedQuantity}
                          </td>
                          <td>
                            {commissionMoney(line.saleCents, order.currency)}
                          </td>
                          <td>
                            {commissionMoney(
                              summary.cancelled
                                ? 0
                                : Math.round(
                                    (line.saleCents *
                                      (line.quantity - line.refundedQuantity)) /
                                      line.quantity /
                                      10,
                                  ),
                              order.currency,
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {c.payments.map((payment, i) => (
                  <p className="referralPayment" key={i}>
                    {new Date(payment.at).toLocaleDateString("tr-TR")} ·{" "}
                    {payment.amountCents < 0 ? "Geri alındı" : "Ödeme"}:{" "}
                    {commissionMoney(
                      Math.abs(payment.amountCents),
                      order.currency,
                    )}{" "}
                    · {payment.reference}
                  </p>
                ))}
              </details>
            );
          })
        ) : (
          <div className="sellerEmpty">
            <ReceiptText size={28} />
            <h3>Satışlarınız burada görünecek</h3>
            <p>
              Getirdiğiniz müşterilerin yeni siparişleri ürün bazında otomatik
              işlenir.
            </p>
          </div>
        )}
        <p className="referralFineprint">
          Son 100 sipariş gösterilir; CSV tüm kayıtları içerir. Komisyon KDV
          dahil ürün satır tutarından hesaplanır. Tahsilat ve teslimat birlikte
          tamamlanınca ödenebilir olur. Ödemeler yönetici mutabakatıyla
          kaydedilir; iptal ve ürün iadeleri kazancı azaltır.
        </p>
      </section>
    </main>
  );
}
