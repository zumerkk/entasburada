"use client";

import { useState } from "react";
import { Lock, ShieldCheck } from "lucide-react";

/**
 * DirectPost 3D kart formu.
 *
 * ÖNEMLİ: Form `action` doğrudan ZiraatPay'in DirectPost adresidir; tarayıcı kart
 * bilgisini DOĞRUDAN ZiraatPay'e gönderir — bizim sunucumuza asla gelmez, hiçbir
 * yere loglanmaz. Bu yüzden submit JS ile engellenmez (preventDefault YOK).
 *
 * `installmentCount` gönderdiğimiz değerle sabittir; ZiraatPay ikinci bir taksit
 * ekranı göstermez, seçilen tutar ve taksit aynen işlenir.
 */
export function CardPaymentForm({
  directPostUrl,
  installments,
  amountLabel,
  monthlyLabel
}: {
  directPostUrl: string;
  installments: number;
  amountLabel: string;
  monthlyLabel?: string;
}) {
  const [pan, setPan] = useState("");
  const [cvv, setCvv] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 12 }, (_, index) => currentYear + index);

  return (
    <form
      method="POST"
      action={directPostUrl}
      className="cardForm"
      autoComplete="on"
      onSubmit={() => setSubmitting(true)}
    >
      {/* Taksit sayısı sabit: seçilen plan neyse o işlenir. */}
      <input type="hidden" name="installmentCount" value={installments} />

      <div className="cardFormGrid">
        <label className="cardFieldWide">
          Kart Üzerindeki İsim
          <input
            name="cardOwner"
            required
            autoComplete="cc-name"
            placeholder="AD SOYAD"
            spellCheck={false}
          />
        </label>

        <label className="cardFieldWide">
          Kart Numarası
          <input
            name="pan"
            required
            inputMode="numeric"
            autoComplete="cc-number"
            placeholder="0000 0000 0000 0000"
            maxLength={19}
            value={pan}
            onChange={(event) => setPan(event.target.value.replace(/\D/g, "").slice(0, 19))}
          />
        </label>

        <label>
          Ay
          <select name="expiryMonth" required autoComplete="cc-exp-month" defaultValue="">
            <option value="" disabled>
              AA
            </option>
            {Array.from({ length: 12 }, (_, index) => String(index + 1).padStart(2, "0")).map((month) => (
              <option value={month} key={month}>
                {month}
              </option>
            ))}
          </select>
        </label>

        <label>
          Yıl
          <select name="expiryYear" required autoComplete="cc-exp-year" defaultValue="">
            <option value="" disabled>
              YYYY
            </option>
            {years.map((year) => (
              <option value={year} key={year}>
                {year}
              </option>
            ))}
          </select>
        </label>

        <label>
          CVC / CVV
          <input
            name="cvv"
            required
            inputMode="numeric"
            autoComplete="cc-csc"
            placeholder="000"
            maxLength={4}
            value={cvv}
            onChange={(event) => setCvv(event.target.value.replace(/\D/g, "").slice(0, 4))}
          />
        </label>
      </div>

      <div className="cardFormFooter">
        <div>
          <span>Ödenecek tutar</span>
          <strong>{amountLabel}</strong>
          <small>
            {installments > 1 ? `${installments} taksit${monthlyLabel ? ` x ${monthlyLabel}` : ""}` : "Tek çekim"}
          </small>
        </div>
        <button type="submit" className="btn btnPrimary cardPayButton" disabled={submitting}>
          <Lock size={17} aria-hidden="true" />
          {submitting ? "3D Doğrulamaya gidiliyor…" : "Ödemeyi Tamamla"}
        </button>
      </div>

      <p className="checkoutSecureNote">
        <ShieldCheck size={15} aria-hidden="true" />
        Kart bilgileriniz doğrudan ZiraatPay'e iletilir, sitemize kaydedilmez. Onay için bankanızın
        3D Secure ekranına yönlendirileceksiniz.
      </p>
    </form>
  );
}
