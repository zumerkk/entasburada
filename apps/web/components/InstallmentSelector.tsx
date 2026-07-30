"use client";

import { useState } from "react";
import { CreditCard, ShieldCheck } from "lucide-react";

export interface InstallmentChoice {
  count: number;
  commissionRate: number;
  effectiveRate: number;
  total: number;
  monthly: number;
  commissionAmount: number;
}

/**
 * Taksit seçim ekranı: her seçenek komisyona göre hesaplanmış tutarıyla listelenir.
 * Seçilen taksit ve tutar ZiraatPay'e gönderilir; müşteri tam olarak burada gördüğü
 * tutarı öder.
 */
export function InstallmentSelector({
  trackingCode,
  options
}: {
  trackingCode: string;
  options: InstallmentChoice[];
}) {
  const [selected, setSelected] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const current = options.find((option) => option.count === selected) ?? options[0];

  async function pay() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/payments/ziraatpay/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trackingCode, installments: selected })
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
    <div className="checkoutSelector">
      <div className="checkoutOptionList" role="radiogroup" aria-label="Taksit seçenekleri">
        {options.map((option) => {
          const active = option.count === selected;
          return (
            <button
              type="button"
              key={option.count}
              role="radio"
              aria-checked={active}
              className={`checkoutOption ${active ? "checkoutOptionActive" : ""}`}
              onClick={() => setSelected(option.count)}
            >
              <span className="checkoutOptionRadio" aria-hidden="true" />
              <span className="checkoutOptionLabel">
                <strong>{option.count === 1 ? "Tek Çekim" : `${option.count} Taksit`}</strong>
                {option.count > 1 ? <small>{formatTry(option.monthly)} x {option.count} ay</small> : <small>Peşin ödeme</small>}
              </span>
              <span className="checkoutOptionTotal">
                <strong>{formatTry(option.total)}</strong>
                <small>
                  {option.effectiveRate > 0
                    ? `+%${option.effectiveRate.toLocaleString("tr-TR")} vade farkı`
                    : "vade farkı yok"}
                </small>
              </span>
            </button>
          );
        })}
      </div>

      {current ? (
        <div className="checkoutTotalBar">
          <div>
            <span>Ödenecek tutar</span>
            <strong>{formatTry(current.total)}</strong>
            {current.count > 1 ? (
              <small>
                {current.count} taksit x {formatTry(current.monthly)}
                {current.commissionAmount > 0 ? ` · ${formatTry(current.commissionAmount)} vade farkı dahil` : ""}
              </small>
            ) : (
              <small>Tek çekim · vade farkı yok</small>
            )}
          </div>
          <button type="button" className="btn btnPrimary checkoutPayButton" onClick={pay} disabled={loading}>
            <CreditCard size={18} aria-hidden="true" />
            {loading ? "Yönlendiriliyor…" : "Güvenli Ödemeye Geç"}
          </button>
        </div>
      ) : null}

      {error ? <p className="formError">{error}</p> : null}

      <p className="checkoutSecureNote">
        <ShieldCheck size={15} aria-hidden="true" />
        Kart bilgileriniz ZiraatPay 3D Secure sayfasında girilir, sitemizde saklanmaz.
      </p>
    </div>
  );
}

function formatTry(value: number): string {
  return new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY" }).format(value);
}
