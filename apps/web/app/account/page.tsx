import { ArrowRight, BadgePercent, Bell, BellRing, Clock3, FileSpreadsheet, FileText, Gauge, Heart, PackageCheck, ShieldCheck, ShoppingCart, TrendingDown, TrendingUp, Truck, WalletCards } from "lucide-react";
import { orderStatusLabel, quoteStatusLabel } from "../../lib/commercial-labels";
import { StatusPill } from "@entas/ui";
import { loadPricedCart } from "../../lib/cart-repository";
import { requireCustomer } from "../../lib/customer-auth";
import { formatMoney, parseMoney, segmentLabel } from "../../lib/customer-pricing";
import { searchAdminOrders, searchAdminQuotes } from "../../lib/commercial-repository";
import { getCustomerBalance, getLedgerEntries } from "../../lib/customer-balance-repository";
import { listCustomerNotifications } from "../../lib/notification-repository";
import { listFavorites } from "../../lib/favorites-repository";
import { listStockSubscriptions } from "../../lib/stock-notify-repository";
import { customerLogoutAction } from "../login/actions";
import { changePasswordAction, toggleFavoriteAction, unsubscribeStockAction } from "./actions";
import { FREE_SHIPPING_THRESHOLD_TRY } from "../../lib/commercial-policy";

export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;

export default async function AccountPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const passwordChanged = params.passwordChanged === "1";
  const passwordErrorRaw = params.passwordError;
  const passwordError = Array.isArray(passwordErrorRaw) ? passwordErrorRaw[0] : passwordErrorRaw;
  const customer = await requireCustomer({ allowPasswordChangeRequired: true });
  const [quotes, orders, cart, notifications, balance, ledger, favorites, stockSubscriptions] = await Promise.all([
    searchAdminQuotes({ q: customer.email, limit: 5 }),
    searchAdminOrders({ q: customer.email, limit: 5 }),
    loadPricedCart(customer),
    listCustomerNotifications(customer.email, 8),
    getCustomerBalance(customer),
    getLedgerEntries(customer.id),
    listFavorites(customer.id),
    listStockSubscriptions(customer.id)
  ]);
  const recentLedger = ledger.slice(0, 6);
  const tierName = customer.tierName ?? segmentLabel(customer.segment);
  const tierRank = customer.tierRank ?? "Bayi";
  const openOrders = orders.items.filter((order) => !["DELIVERED", "COMPLETED", "CANCELLED"].includes(order.status)).length;
  const activeQuotes = quotes.items.filter((quote) => !["REJECTED", "EXPIRED", "CONVERTED"].includes(quote.status)).length;
  const creditLimit = formatMoney(parseMoney(customer.creditLimit ?? "0"), "TRY");
  const approvalLimit = formatMoney(parseMoney(customer.approvalLimit ?? "0"), "TRY");
  const freeShippingThreshold = parseMoney(customer.freeShippingThreshold ?? String(FREE_SHIPPING_THRESHOLD_TRY));

  return (
    <main className="accountPage">
      <section className={`accountHero tier-${customer.segment}`}>
        <div className="shell accountHeroInner">
          <div className="accountHeroCopy">
            <span className="accountEyebrow">Bayi çalışma alanı</span>
            <h1>{customer.companyName}</h1>
            <div className="accountIdentityLine">
              <span>{customer.authorizedPerson}</span>
              <span>{tierName}</span>
              <span>{tierRank}</span>
            </div>
            <div className="accountHeroBadges">
              <StatusPill tone="success">Herkese aynı fiyat</StatusPill>
              <StatusPill tone={customer.segment === "project" ? "warning" : "info"}>{customer.supportLevel ?? "Bayi destek"}</StatusPill>
              <StatusPill tone="neutral">{customer.paymentTermDays ?? 0} gün vade</StatusPill>
            </div>
          </div>

          <aside className="accountTierPanel">
            <span>Seviye</span>
            <strong>{tierRank}</strong>
            <small>{tierName}</small>
            <div className="tierProgress" aria-hidden="true">
              <span style={{ width: `${Math.min(100, Math.max(34, (customer.priorityLevel ?? 1) * 33))}%` }} />
            </div>
          </aside>

          <form action={customerLogoutAction}>
            <button className="btn btnGhost light accountLogout" type="submit">
              Çıkış Yap
            </button>
          </form>
        </div>
      </section>

      <section className="shell accountQuickActions" aria-label="Bayi hızlı aksiyonları">
        <a href="/quick-order">
          <ShoppingCart size={19} aria-hidden="true" />
          <span>Hızlı Sipariş</span>
        </a>
        <a href="/cart">
          <PackageCheck size={19} aria-hidden="true" />
          <span>Sepet</span>
        </a>
        <a href="/quote">
          <FileText size={19} aria-hidden="true" />
          <span>Teklif Al</span>
        </a>
        <a href="/catalog">
          <Gauge size={19} aria-hidden="true" />
          <span>Katalog</span>
        </a>
        <a href="/orders">
          <Truck size={19} aria-hidden="true" />
          <span>Takip</span>
        </a>
      </section>

      <section className="shell accountSummaryGrid">
        <a className="accountStat" href="/cart">
          <span className="accountStatIcon">
            <ShoppingCart size={18} aria-hidden="true" />
          </span>
          <span>Sepet</span>
          <strong>{cart.items.length.toLocaleString("tr-TR")}</strong>
          <small>{cart.displayTotal}</small>
        </a>
        <a className="accountStat" href="/orders">
          <span className="accountStatIcon">
            <FileText size={18} aria-hidden="true" />
          </span>
          <span>Aktif teklif</span>
          <strong>{activeQuotes.toLocaleString("tr-TR")}</strong>
          <small>{quotes.total.toLocaleString("tr-TR")} toplam teklif</small>
        </a>
        <a className="accountStat" href="/orders">
          <span className="accountStatIcon">
            <Truck size={18} aria-hidden="true" />
          </span>
          <span>Açık sipariş</span>
          <strong>{openOrders.toLocaleString("tr-TR")}</strong>
          <small>{orders.total.toLocaleString("tr-TR")} toplam sipariş</small>
        </a>
        <a className="accountStat" href="#cari-hesap">
          <span className="accountStatIcon">
            <WalletCards size={18} aria-hidden="true" />
          </span>
          <span>Cari bakiye</span>
          <strong>{formatMoney(balance.balance, balance.currency)}</strong>
          <small>
            {balance.overLimit
              ? `Limit aşımı ${formatMoney(balance.overLimitAmount, balance.currency)}`
              : `Kullanılabilir ${formatMoney(Math.max(0, balance.availableCredit), balance.currency)}`}
          </small>
        </a>
      </section>

      <section className="shell accountWorkGrid">
        <div className="accountWorkspace">
          <div className="accountSectionHeader">
            <div>
              <span>Operasyon</span>
              <h2>Aktif işler</h2>
            </div>
            <a className="textLink" href="/quick-order">
              Yeni işlem
            </a>
          </div>

          <div className="accountFlow">
            <div className="flowColumn">
              <div className="flowHeader">
                <FileText size={18} aria-hidden="true" />
                <strong>Teklifler</strong>
              </div>
              <div className="accountList upgraded">
                {quotes.items.map((quote) => (
                  <a href={`/quote/${encodeURIComponent(quote.trackingCode)}`} key={quote.id}>
                    <span>
                      <strong>{quote.quoteNo}</strong>
                      <small>{formatDate(quote.requestedAt)}</small>
                    </span>
                    <span>{quote.totalAmount} {quote.currency}</span>
                    <StatusPill tone={quoteStatusLabel(quote.status).tone}>{quoteStatusLabel(quote.status).label}</StatusPill>
                  </a>
                ))}
                {quotes.items.length === 0 ? (
                  <div className="accountEmptyState">
                    <FileSpreadsheet size={20} aria-hidden="true" />
                    <strong>Teklif beklemiyor</strong>
                    <a href="/quote">Teklif oluştur <ArrowRight size={14} aria-hidden="true" /></a>
                  </div>
                ) : null}
              </div>
            </div>

            <div className="flowColumn">
              <div className="flowHeader">
                <Truck size={18} aria-hidden="true" />
                <strong>Siparişler</strong>
              </div>
              <div className="accountList upgraded">
                {orders.items.map((order) => (
                  <a href={`/orders/${encodeURIComponent(order.trackingCode)}`} key={order.id}>
                    <span>
                      <strong>{order.orderNo}</strong>
                      <small>{formatDate(order.orderedAt)}</small>
                    </span>
                    <span>{order.totalAmount} {order.currency}</span>
                    <StatusPill tone={orderStatusLabel(order.status).tone}>{orderStatusLabel(order.status).label}</StatusPill>
                  </a>
                ))}
                {orders.items.length === 0 ? (
                  <div className="accountEmptyState">
                    <ShoppingCart size={20} aria-hidden="true" />
                    <strong>Sipariş beklemiyor</strong>
                    <a href="/cart">Sepeti aç <ArrowRight size={14} aria-hidden="true" /></a>
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </div>

        <aside className="accountSideRail">
          <section className="accountPanel" id="cari-hesap">
            <div className="accountSectionHeader compact">
              <div>
                <span>Cari hesap</span>
                <h2>Bakiye durumu</h2>
              </div>
              <WalletCards size={20} aria-hidden="true" />
            </div>
            <div className="balanceOverview">
              <div className="balanceHeadline">
                <span>Güncel bakiye</span>
                <strong className={balance.balance > 0 ? "isDebt" : "isClear"}>
                  {formatMoney(balance.balance, balance.currency)}
                </strong>
                <small>{balance.balance > 0 ? "Ödenecek borç bakiyesi" : balance.balance < 0 ? "Lehinize alacak bakiyesi" : "Bakiye kapalı"}</small>
              </div>
              <div className="balanceMeta">
                <div>
                  <span>Kredi limiti</span>
                  <strong>{creditLimit}</strong>
                </div>
                <div>
                  <span>Kullanılabilir</span>
                  <strong className={balance.overLimit ? "isDebt" : ""}>
                    {formatMoney(balance.availableCredit, balance.currency)}
                  </strong>
                </div>
                <div>
                  <span>Onay limiti</span>
                  <strong>{approvalLimit}</strong>
                </div>
              </div>
              {balance.overLimit ? (
                <p className="balanceAlert" role="alert">
                  Kredi limitiniz {formatMoney(balance.overLimitAmount, balance.currency)} tutarında aşıldı. Yeni sipariş öncesi ödeme gerekebilir.
                </p>
              ) : null}
            </div>
            <div className="balanceLedger">
              {recentLedger.map((item) => (
                <div className={`balanceRow ${item.type}`} key={item.id}>
                  <span className="balanceRowIcon" aria-hidden="true">
                    {item.type === "debit" ? <TrendingUp size={15} /> : <TrendingDown size={15} />}
                  </span>
                  <span className="balanceRowInfo">
                    <strong>{item.description}</strong>
                    <small>{formatDate(item.date)}</small>
                  </span>
                  <span className={`balanceRowAmount ${item.type}`}>
                    {item.type === "debit" ? "+" : "−"}
                    {formatMoney(parseMoney(item.amount), balance.currency)}
                  </span>
                </div>
              ))}
              {recentLedger.length === 0 ? (
                <div className="accountEmptyState slim">
                  <WalletCards size={18} aria-hidden="true" />
                  <strong>Cari hareket yok</strong>
                </div>
              ) : null}
            </div>
          </section>

          <section className="accountPanel">
            <div className="accountSectionHeader compact">
              <div>
                <span>Ayrıcalıklar</span>
                <h2>{tierRank}</h2>
              </div>
              <ShieldCheck size={20} aria-hidden="true" />
            </div>
            <div className="privilegeGrid">
              {(customer.perks ?? []).map((perk) => (
                <span key={perk}>{perk}</span>
              ))}
              <span>{formatMoney(freeShippingThreshold, "TRY")} ve üzeri kargo bizden</span>
            </div>
          </section>

          <section className="accountPanel">
            <div className="accountSectionHeader compact">
              <div>
                <span>Fiyat politikası</span>
                <h2>Ortak marka fiyatı</h2>
              </div>
              <BadgePercent size={20} aria-hidden="true" />
            </div>
            <div className="discountStack">
              <div>
                <span>Müşteriye özel iskonto</span>
                <strong>%0</strong>
              </div>
              <div>
                <span>KDV</span>
                <strong>Dahil</strong>
              </div>
              <div>
                <span>Kargo</span>
                <strong>10.000 TL üzeri bizden</strong>
              </div>
            </div>
          </section>

          <section className="accountPanel">
            <div className="accountSectionHeader compact">
              <div>
                <span>Bildirimler</span>
                <h2>Son hareketler</h2>
              </div>
              <Bell size={20} aria-hidden="true" />
            </div>
            <div className="notificationList compactList">
              {notifications.map((notification) => (
                <a href={notification.href ?? "/account"} className={notification.level} key={notification.id}>
                  <strong>{notification.title}</strong>
                  <span>{notification.body}</span>
                  <small>{new Date(notification.createdAt).toLocaleString("tr-TR")}</small>
                </a>
              ))}
              {notifications.length === 0 ? (
                <div className="accountEmptyState slim">
                  <Clock3 size={18} aria-hidden="true" />
                  <strong>Yeni bildirim yok</strong>
                </div>
              ) : null}
            </div>
          </section>

          <section className="accountPanel" id="favorites">
            <div className="accountSectionHeader compact">
              <div>
                <span>Kayıtlı liste</span>
                <h2>Favorilerim</h2>
              </div>
              <Heart size={20} aria-hidden="true" />
            </div>
            <div className="favoriteList">
              {favorites.map((favorite) => (
                <div className="favoriteRow" key={favorite.productSlug || favorite.sku}>
                  <div className="favoriteInfo">
                    <strong>{favorite.productName}</strong>
                    <small>{favorite.sku}</small>
                  </div>
                  <form action={toggleFavoriteAction}>
                    <input type="hidden" name="sku" value={favorite.sku} />
                    <input type="hidden" name="productSlug" value={favorite.productSlug ?? ""} />
                    <input type="hidden" name="productName" value={favorite.productName} />
                    <input type="hidden" name="redirectTo" value="/account#favorites" />
                    <button type="submit" className="btn btnGhost btnSmall" aria-label="Favorilerden çıkar">
                      Çıkar
                    </button>
                  </form>
                </div>
              ))}
              {favorites.length === 0 ? (
                <div className="accountEmptyState slim">
                  <Heart size={18} aria-hidden="true" />
                  <strong>Henüz favori ürün yok</strong>
                </div>
              ) : null}
            </div>
          </section>

          <section className="accountPanel" id="stock-alerts">
            <div className="accountSectionHeader compact">
              <div>
                <span>Stok bildirimleri</span>
                <h2>Stok gelince haber ver</h2>
              </div>
              <BellRing size={20} aria-hidden="true" />
            </div>
            <div className="favoriteList">
              {stockSubscriptions.map((sub) => (
                <div className="favoriteRow" key={sub.id}>
                  <div className="favoriteInfo">
                    <strong>{sub.productSlug ? <a href={`/products/${sub.productSlug}`}>{sub.productName}</a> : sub.productName}</strong>
                    <small>{sub.sku}</small>
                  </div>
                  <form action={unsubscribeStockAction}>
                    <input type="hidden" name="sku" value={sub.sku} />
                    <input type="hidden" name="productSlug" value={sub.productSlug} />
                    <input type="hidden" name="redirectTo" value="/account#stock-alerts" />
                    <button type="submit" className="btn btnGhost btnSmall">
                      İptal
                    </button>
                  </form>
                </div>
              ))}
              {stockSubscriptions.length === 0 ? (
                <div className="accountEmptyState slim">
                  <BellRing size={18} aria-hidden="true" />
                  <strong>Stok bildirim aboneliğiniz yok</strong>
                </div>
              ) : null}
            </div>
          </section>

          <section className="accountPanel" id="security">
            <div className="accountSectionHeader compact">
              <div>
                <span>Güvenlik</span>
                <h2>Şifre değiştir</h2>
              </div>
              <ShieldCheck size={20} aria-hidden="true" />
            </div>
            {passwordChanged ? <p className="formSuccess">Şifreniz güncellendi.</p> : null}
            {passwordError ? (
              <p className="formError" role="alert">
                {passwordError}
              </p>
            ) : null}
            <form className="passwordChangeForm" action={changePasswordAction}>
              <label>
                Mevcut şifre
                <input name="currentPassword" type="password" autoComplete="current-password" required />
              </label>
              <label>
                Yeni şifre
                <input name="newPassword" type="password" autoComplete="new-password" minLength={8} required />
              </label>
              <label>
                Yeni şifre (tekrar)
                <input name="newPasswordRepeat" type="password" autoComplete="new-password" minLength={8} required />
              </label>
              <button className="btn btnPrimary" type="submit">
                Şifreyi Güncelle
              </button>
            </form>
          </section>
        </aside>
      </section>
    </main>
  );
}

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "-" : date.toLocaleDateString("tr-TR");
}
