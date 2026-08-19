import { ArrowLeft, CheckCircle2, Clock3, CreditCard, ReceiptText, ShieldCheck, WalletCards } from "lucide-react";
import { StatusPill } from "@entas/ui";
import { DebtPaymentForm } from "../../../components/DebtPaymentForm";
import { requireCustomer } from "../../../lib/customer-auth";
import { getCustomerBalance } from "../../../lib/customer-balance-repository";
import {
  getCustomerPendingBalancePaymentTotal,
  listCustomerBalancePayments,
  type CustomerBalancePayment
} from "../../../lib/customer-balance-payment-repository";
import { remainingBalancePaymentAmount } from "../../../lib/customer-balance-payment-policy";
import { formatMoney } from "../../../lib/customer-pricing";

export const dynamic = "force-dynamic";

const PAYMENT_NOTICE: Record<string, { tone: "success" | "danger"; text: string }> = {
  success: { tone: "success", text: "Kart ödemeniz alındı ve cari hesabınıza işlendi. Teşekkürler." },
  failed: { tone: "danger", text: "Ödeme tamamlanamadı. Kartınızdan tahsilat yapılmadıysa yeniden deneyebilirsiniz." },
  invalid: { tone: "danger", text: "Ödeme sonucu doğrulanamadı. Tekrar ödeme yapmadan önce bizimle iletişime geçin." }
};

export default async function DebtPaymentPage({
  searchParams
}: {
  searchParams: Promise<{ payment?: string; reference?: string }>;
}) {
  const [{ payment }, customer] = await Promise.all([searchParams, requireCustomer()]);
  const [balance, recentPayments, pendingPaymentTotal] = await Promise.all([
    getCustomerBalance(customer),
    listCustomerBalancePayments(customer.id, 8),
    getCustomerPendingBalancePaymentTotal(customer.id)
  ]);
  const openDebt = Math.max(0, balance.balance);
  const payableDebt = remainingBalancePaymentAmount(openDebt, pendingPaymentTotal);
  const resumablePayment = recentPayments.find((item) => item.status === "pending");
  const notice = payment ? PAYMENT_NOTICE[payment] : undefined;

  return (
    <main className="debtPaymentPage">
      <section className="shell pageIntro compact">
        <div>
          <span className="eyebrow dark">Cari hesap</span>
          <h1>Kartla Borç Ödeme</h1>
          <p>{customer.companyName} · Ödemek istediğiniz tutarı kendiniz belirleyin.</p>
        </div>
        <a className="btn btnGhost dark" href="/account#cari-hesap">
          <ArrowLeft size={17} aria-hidden="true" />
          Hesabıma Dön
        </a>
      </section>

      {notice ? (
        <section className="shell debtPaymentNotice">
          <StatusPill tone={notice.tone}>{notice.text}</StatusPill>
        </section>
      ) : null}

      <section className="shell debtPaymentGrid">
        <article className="panel debtPaymentMain">
          <div className="panelHeader compact">
            <div>
              <h2>Ödeme tutarını belirleyin</h2>
              <p>Açık borcunuzun tamamını veya dilediğiniz bir kısmını kartla ödeyebilirsiniz.</p>
            </div>
            <CreditCard size={24} aria-hidden="true" />
          </div>

          {payableDebt > 0 ? (
            <DebtPaymentForm openDebt={payableDebt} />
          ) : openDebt > 0 ? (
            <div className="debtPaymentClear pending">
              <Clock3 size={30} aria-hidden="true" />
              <div>
                <strong>Ödemeniz banka onayı bekliyor</strong>
                <span>Sonuçlanınca bakiyeniz otomatik güncellenecek. Bu sırada yeni ödeme başlatılamaz.</span>
                {resumablePayment ? (
                  <a className="btn btnGhost dark btnSmall" href={`/api/payments/ziraatpay/balance/${resumablePayment.id}/resume`}>
                    Ödemeye Devam Et
                  </a>
                ) : null}
              </div>
            </div>
          ) : (
            <div className="debtPaymentClear">
              <CheckCircle2 size={30} aria-hidden="true" />
              <div>
                <strong>Ödenecek açık borcunuz bulunmuyor</strong>
                <span>Cari hesabınız kapalı veya alacak bakiyesindedir.</span>
              </div>
            </div>
          )}
        </article>

        <aside className="debtPaymentSide">
          <section className="panel debtPaymentSummary">
            <div className="cartSummaryHeading">
              <span>Cari hesap özeti</span>
              <WalletCards size={20} aria-hidden="true" />
            </div>
            <div className="debtPaymentBalance">
              <span>Güncel açık borç</span>
              <strong>{formatMoney(openDebt, balance.currency)}</strong>
              <small>Yalnızca bu tutara kadar ödeme başlatılabilir.</small>
            </div>
            <div className="checkoutSummaryRows">
              {pendingPaymentTotal > 0 ? (
                <div>
                  <span>Banka onayı bekleyen</span>
                  <strong>{formatMoney(pendingPaymentTotal, balance.currency)}</strong>
                </div>
              ) : null}
              {pendingPaymentTotal > 0 && payableDebt > 0 ? (
                <div>
                  <span>Yeni ödenebilir tutar</span>
                  <strong>{formatMoney(payableDebt, balance.currency)}</strong>
                </div>
              ) : null}
              <div>
                <span>Kredi limiti</span>
                <strong>{formatMoney(balance.creditLimit, balance.currency)}</strong>
              </div>
              <div>
                <span>Ödeme para birimi</span>
                <strong>TRY</strong>
              </div>
              <div>
                <span>Güvenlik</span>
                <strong>3D Secure</strong>
              </div>
            </div>
            <p className="debtPaymentSecurity">
              <ShieldCheck size={17} aria-hidden="true" />
              Banka onayı gelmeden cari hesabınıza ödeme kaydı oluşturulmaz.
            </p>
          </section>

          <section className="panel debtPaymentHistory">
            <div className="cartSummaryHeading">
              <span>Son kart ödemeleri</span>
              <ReceiptText size={20} aria-hidden="true" />
            </div>
            {recentPayments.length > 0 ? (
              <div className="debtPaymentHistoryList">
                {recentPayments.map((item) => (
                  <div key={item.id}>
                    <span>
                      <strong>{formatMoney(Number(item.amount), item.currency)}</strong>
                      <small>{new Date(item.createdAt).toLocaleString("tr-TR")}</small>
                    </span>
                    <span className="debtPaymentHistoryActions">
                      <StatusPill tone={paymentTone(item.status)}>{paymentStatusLabel(item.status)}</StatusPill>
                      {item.status === "pending" ? (
                        <a href={`/api/payments/ziraatpay/balance/${item.id}/resume`}>Devam et</a>
                      ) : null}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="balanceEmpty">Henüz kartla cari ödeme kaydı yok.</p>
            )}
          </section>
        </aside>
      </section>
    </main>
  );
}

function paymentStatusLabel(status: CustomerBalancePayment["status"]): string {
  if (status === "paid") return "Ödendi";
  if (status === "failed") return "Başarısız";
  if (status === "pending") return "Banka onayı bekleniyor";
  if (status === "expired") return "Süresi doldu";
  return "Hazırlanıyor";
}

function paymentTone(status: CustomerBalancePayment["status"]): "success" | "danger" | "warning" | "neutral" {
  if (status === "paid") return "success";
  if (status === "failed") return "danger";
  if (status === "pending") return "warning";
  if (status === "expired") return "neutral";
  return "neutral";
}
