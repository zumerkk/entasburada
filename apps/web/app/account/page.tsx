import { ArrowRight, BadgePercent, Bell, Clock3, FileSpreadsheet, FileText, Gauge, PackageCheck, ShieldCheck, ShoppingCart, Truck, WalletCards } from "lucide-react";
import { StatusPill } from "@entas/ui";
import { loadPricedCart } from "../../lib/cart-repository";
import { requireCustomer } from "../../lib/customer-auth";
import { formatMoney, parseMoney, segmentLabel } from "../../lib/customer-pricing";
import { searchAdminOrders, searchAdminQuotes } from "../../lib/commercial-repository";
import { listCustomerNotifications } from "../../lib/notification-repository";
import { customerLogoutAction } from "../login/actions";
import { changePasswordAction } from "./actions";

export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;

export default async function AccountPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const passwordChanged = params.passwordChanged === "1";
  const passwordErrorRaw = params.passwordError;
  const passwordError = Array.isArray(passwordErrorRaw) ? passwordErrorRaw[0] : passwordErrorRaw;
  const customer = await requireCustomer();
  const [quotes, orders, cart, notifications] = await Promise.all([
    searchAdminQuotes({ q: customer.email, limit: 5 }),
    searchAdminOrders({ q: customer.email, limit: 5 }),
    loadPricedCart(customer),
    listCustomerNotifications(customer.email, 8)
  ]);
  const tierName = customer.tierName ?? segmentLabel(customer.segment);
  const tierRank = customer.tierRank ?? "Bayi";
  const openOrders = orders.items.filter((order) => !["DELIVERED", "COMPLETED", "CANCELLED"].includes(order.status)).length;
  const activeQuotes = quotes.items.filter((quote) => !["REJECTED", "EXPIRED", "CONVERTED"].includes(quote.status)).length;
  const creditLimit = formatMoney(parseMoney(customer.creditLimit ?? "0"), "TRY");
  const approvalLimit = formatMoney(parseMoney(customer.approvalLimit ?? "0"), "TRY");
  const freeShippingThreshold = parseMoney(customer.freeShippingThreshold ?? "0");

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
              <StatusPill tone="success">%{customer.baseDiscountRate} baz iskonto</StatusPill>
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
        <div className="accountStat">
          <span className="accountStatIcon">
            <WalletCards size={18} aria-hidden="true" />
          </span>
          <span>Limit</span>
          <strong>{creditLimit}</strong>
          <small>Onay limiti {approvalLimit}</small>
        </div>
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
                    <StatusPill tone={quote.status === "REJECTED" ? "danger" : quote.status === "CONVERTED" ? "success" : "info"}>{quote.status}</StatusPill>
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
                    <StatusPill tone={order.status === "CANCELLED" ? "danger" : order.status === "COMPLETED" ? "success" : "info"}>{order.status}</StatusPill>
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
              {freeShippingThreshold === 0 ? <span>Kargo baremi yok</span> : <span>{formatMoney(freeShippingThreshold, "TRY")} üzeri sevkiyat avantajı</span>}
            </div>
          </section>

          <section className="accountPanel">
            <div className="accountSectionHeader compact">
              <div>
                <span>Fiyat motoru</span>
                <h2>İskonto öncelikleri</h2>
              </div>
              <BadgePercent size={20} aria-hidden="true" />
            </div>
            <div className="discountStack">
              <div>
                <span>Baz</span>
                <strong>%{customer.baseDiscountRate}</strong>
              </div>
              {Object.entries(customer.brandDiscounts).slice(0, 2).map(([brand, rate]) => (
                <div key={brand}>
                  <span>{brand}</span>
                  <strong>%{rate}</strong>
                </div>
              ))}
              {Object.entries(customer.categoryDiscounts).slice(0, 2).map(([category, rate]) => (
                <div key={category}>
                  <span>{category}</span>
                  <strong>%{rate}</strong>
                </div>
              ))}
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
