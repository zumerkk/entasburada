import { ArrowLeft, Building2, CreditCard, ReceiptText, ShieldCheck, WalletCards } from "lucide-react";
import { StatusPill } from "@entas/ui";
import { DebtPaymentForm } from "../../../components/DebtPaymentForm";
import { requireCustomer } from "../../../lib/customer-auth";
import {
  listCustomerBalancePayments,
  type CustomerBalancePayment
} from "../../../lib/customer-balance-payment-repository";
import { formatMoney } from "../../../lib/customer-pricing";

export const dynamic = "force-dynamic";

const PAYMENT_NOTICE: Record<string, { tone: "success" | "danger"; text: string }> = {
  success: { tone: "success", text: "Kart ödemeniz alındı ve tahsilat kaydınız oluşturuldu. Teşekkürler." },
  failed: { tone: "danger", text: "Ödeme tamamlanamadı. Kartınızdan tahsilat yapılmadıysa yeniden deneyebilirsiniz." },
  invalid: { tone: "danger", text: "Ödeme sonucu doğrulanamadı. Tekrar ödeme yapmadan önce bizimle iletişime geçin." }
};

export default async function DebtPaymentPage({
  searchParams
}: {
  searchParams: Promise<{ payment?: string; reference?: string }>;
}) {
  const [{ payment }, customer] = await Promise.all([searchParams, requireCustomer()]);
  const recentPayments = await listCustomerBalancePayments(customer.id, 8);
  const notice = payment ? PAYMENT_NOTICE[payment] : undefined;

  return (
    <main className="debtPaymentPage">
      <section className="shell pageIntro compact">
        <div>
          <span className="eyebrow dark">Cari hesap</span>
          <h1>Kartla Cari Ödeme</h1>
          <p>{customer.companyName} · Defter veya cari hesabınız için ödemek istediğiniz tutarı kendiniz belirleyin.</p>
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
              <h2>Ödeme tutarını kendiniz girin</h2>
              <p>Sitede borç bakiyesi görünmese bile dilediğiniz tutarda cari ödeme yapabilirsiniz.</p>
            </div>
            <CreditCard size={24} aria-hidden="true" />
          </div>

          <DebtPaymentForm />
        </article>

        <aside className="debtPaymentSide">
          <section className="panel debtPaymentSummary">
            <div className="cartSummaryHeading">
              <span>Ödeme bilgileri</span>
              <WalletCards size={20} aria-hidden="true" />
            </div>
            <div className="debtPaymentManualNote">
              <Building2 size={21} aria-hidden="true" />
              <div>
                <strong>Serbest cari tahsilat</strong>
                <span>Defterinizde bulunan borç için ödeme tutarını elle girebilirsiniz.</span>
              </div>
            </div>
            <div className="checkoutSummaryRows">
              <div>
                <span>Firma</span>
                <strong>{customer.companyName}</strong>
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
              Banka onayı gelmeden tahsilat tamamlanmış sayılmaz.
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
