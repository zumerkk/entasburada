"use client";

import { useState } from "react";
import { CreditCard, ShieldCheck } from "lucide-react";

/**
 * Tek ekran ödeme: taksit seçimi ZiraatPay'in kendi sayfasında yapılır.
 *
 * NEDEN BURADA TAKSİT SEÇİMİ YOK: ZiraatPay ödeme sayfası taksidi bizim
 * gönderdiğimiz değere kilitlemiyor; burada seçtirsek müşteri orada değiştirebilir
 * ve iki ekran çelişirdi. Bu yüzden ana tutar gönderilir, taksidi müşteri tek
 * yerde (ZiraatPay ekranında) seçer.
 */
export function PayNowButton({ trackingCode, amountLabel }: { trackingCode: string; amountLabel: string }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function pay() {
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
    <div className="checkoutSelector">
      <div className="checkoutTotalBar">
        <div>
          <span>Ödenecek tutar</span>
          <strong>{amountLabel}</strong>
          <small>Taksit seçeneklerini bir sonraki adımda göreceksiniz</small>
        </div>
        <button type="button" className="btn btnPrimary checkoutPayButton" onClick={pay} disabled={loading}>
          <CreditCard size={18} aria-hidden="true" />
          {loading ? "Yönlendiriliyor…" : "Güvenli Ödemeye Geç"}
        </button>
      </div>

      {error ? <p className="formError">{error}</p> : null}

      <p className="checkoutSecureNote">
        <ShieldCheck size={15} aria-hidden="true" />
        Kart bilgileriniz ZiraatPay 3D Secure sayfasında girilir, sitemizde saklanmaz. Taksit
        seçimini o ekranda yapabilirsiniz.
      </p>
    </div>
  );
}
