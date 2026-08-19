"use client";

import { useMemo, useState } from "react";
import { ArrowLeft, CreditCard, ShieldCheck, WalletCards } from "lucide-react";
import { CardPaymentForm } from "./CardPaymentForm";
import { MAX_BALANCE_PAYMENT_TRY } from "../lib/customer-balance-payment-policy";

export function DebtPaymentForm({ openDebt }: { openDebt: number }) {
  const [amount, setAmount] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [session, setSession] = useState<{ directPostUrl: string; amount: number } | null>(null);
  const maxPayable = Math.min(openDebt, MAX_BALANCE_PAYMENT_TRY);
  const presets = useMemo(() => {
    const candidates = [10_000, 25_000, 50_000, maxPayable];
    return [...new Set(candidates.map(roundMoney))]
      .filter((value) => value > 0 && value <= maxPayable)
      .sort((left, right) => left - right);
  }, [maxPayable]);

  const parsedAmount = Number(amount);
  const amountValid = Number.isFinite(parsedAmount) && parsedAmount >= 0.01 && parsedAmount <= maxPayable;

  async function startPayment(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!amountValid) {
      setError(`0,01 TL ile ${formatTry(maxPayable)} arasında bir tutar girin.`);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/payments/ziraatpay/balance/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: roundMoney(parsedAmount) })
      });
      const data = (await response.json()) as {
        amount?: string;
        directPostUrl?: string;
        redirectUrl?: string;
        error?: string;
      };
      if (!response.ok) throw new Error(data.error || "Ödeme başlatılamadı.");
      const confirmedAmount = Number(data.amount);
      if (data.directPostUrl && Number.isFinite(confirmedAmount)) {
        setSession({ directPostUrl: data.directPostUrl, amount: confirmedAmount });
        return;
      }
      if (data.redirectUrl) {
        window.location.assign(data.redirectUrl);
        return;
      }
      throw new Error("Ödeme yönlendirmesi alınamadı.");
    } catch (paymentError) {
      setError(paymentError instanceof Error ? paymentError.message : "Ödeme başlatılamadı.");
    } finally {
      setLoading(false);
    }
  }

  if (session) {
    return (
      <div className="debtPaymentSession">
        <button type="button" className="btn btnGhost dark btnSmall" onClick={() => setSession(null)}>
          <ArrowLeft size={15} aria-hidden="true" />
          Tutara Dön
        </button>
        <CardPaymentForm
          directPostUrl={session.directPostUrl}
          installments={1}
          amountLabel={formatTry(session.amount)}
        />
      </div>
    );
  }

  return (
    <form className="debtPaymentForm" onSubmit={startPayment}>
      <label htmlFor="debt-payment-amount">Ödemek istediğiniz tutar</label>
      <div className="debtPaymentAmountField">
        <span>₺</span>
        <input
          id="debt-payment-amount"
          name="amount"
          type="number"
          inputMode="decimal"
          min="0.01"
          max={maxPayable.toFixed(2)}
          step="0.01"
          value={amount}
          onChange={(event) => {
            setAmount(event.target.value);
            setError(null);
          }}
          placeholder="Örn. 50000"
          required
        />
        <span>TL</span>
      </div>

      <div className="debtPaymentPresets" aria-label="Hızlı tutar seçenekleri">
        {presets.map((preset) => (
          <button type="button" key={preset} onClick={() => setAmount(preset.toFixed(2))}>
            {preset === openDebt ? "Tüm borç" : formatCompactTry(preset)}
          </button>
        ))}
      </div>

      <div className="debtPaymentSelection">
        <WalletCards size={18} aria-hidden="true" />
        <span>
          Seçilen ödeme
          <strong>{amountValid ? formatTry(parsedAmount) : "—"}</strong>
        </span>
      </div>

      {error ? <p className="formError" role="alert">{error}</p> : null}

      <button className="btn btnPrimary debtPaymentSubmit" type="submit" disabled={loading || !amountValid}>
        <CreditCard size={18} aria-hidden="true" />
        {loading ? "Güvenli ödeme hazırlanıyor…" : "Kartla Ödemeye Geç"}
      </button>

      <p className="checkoutSecureNote">
        <ShieldCheck size={15} aria-hidden="true" />
        Kart bilgileriniz ZiraatPay 3D Secure altyapısında işlenir ve ENTAŞBURADA’da saklanmaz.
      </p>
    </form>
  );
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function formatTry(value: number): string {
  return new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY" }).format(value);
}

function formatCompactTry(value: number): string {
  return `${new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 0 }).format(value)} TL`;
}
