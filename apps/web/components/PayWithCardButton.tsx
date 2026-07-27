"use client";

import { useState } from "react";

/**
 * Siparişi kartla ödeme başlatır: /api/payments/ziraatpay/start çağırır,
 * dönen ZiraatPay HPP adresine yönlendirir.
 */
export function PayWithCardButton({ trackingCode }: { trackingCode: string }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function startPayment() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/payments/ziraatpay/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trackingCode })
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
      <button type="button" className="btn btnPrimary" onClick={startPayment} disabled={loading}>
        {loading ? "Yönlendiriliyor…" : "Kartla Öde"}
      </button>
      {error ? <p className="formError">{error}</p> : null}
    </div>
  );
}
