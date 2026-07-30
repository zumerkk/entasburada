"use client";

import { useState } from "react";

export interface InstallmentChoice {
  count: number;
  commissionRate: number;
  effectiveRate: number;
  total: number;
  monthly: number;
}

/**
 * Siparişi kartla ödeme başlatır. Taksit seçenekleri komisyon dahil tutarlarıyla
 * gösterilir (tek çekimde fiyat değişmez); seçim /start'a gönderilir.
 */
export function PayWithCardButton({
  trackingCode,
  options,
  note
}: {
  trackingCode: string;
  options: InstallmentChoice[];
  note?: string;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [installments, setInstallments] = useState(1);

  const selected = options.find((option) => option.count === installments) ?? options[0];

  async function startPayment() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/payments/ziraatpay/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trackingCode, installments })
      });
      const data = (await response.json()) as { redirectUrl?: string; error?: string };
      if (!response.ok || !data.redirectUrl) {
        throw new Error(data.error || "Ödeme başlatılamadı.");
      }
      window.location.href = data.redirectUrl;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ödeme başlatılamadı.");
      setLoading(false);
    }
  }

  return (
    <div className="payWithCard">
      {note ? <p className="installmentNote">{note}</p> : null}

      {options.length > 1 ? (
        <div className="installmentPicker">
          <label htmlFor="installmentCount">Taksit seçeneği</label>
          <select
            id="installmentCount"
            value={installments}
            onChange={(event) => setInstallments(Number(event.target.value))}
          >
            {options.map((option) => (
              <option value={option.count} key={option.count}>
                {option.count === 1
                  ? `Tek çekim — ${formatTry(option.total)}`
                  : `${option.count} taksit — ${formatTry(option.monthly)} x ${option.count} = ${formatTry(option.total)}` +
                    ` (+%${option.effectiveRate.toLocaleString("tr-TR")})`}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      {selected ? (
        <p className="installmentSummary">
          Ödenecek tutar: <strong>{formatTry(selected.total)}</strong>
          {selected.count > 1 ? ` — ${selected.count} x ${formatTry(selected.monthly)}` : " (tek çekim)"}
        </p>
      ) : null}

      <button type="button" className="btn btnPrimary" onClick={startPayment} disabled={loading}>
        {loading ? "Yönlendiriliyor…" : "Kartla Öde"}
      </button>
      {error ? <p className="formError">{error}</p> : null}
    </div>
  );
}

function formatTry(value: number): string {
  return new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY" }).format(value);
}
