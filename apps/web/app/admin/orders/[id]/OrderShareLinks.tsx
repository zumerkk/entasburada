"use client";

import { useState } from "react";
import { Check, Copy, CreditCard, ExternalLink, Link2, MessageCircle } from "lucide-react";

interface OrderShareLinksProps {
  siteUrl: string;
  orderNo: string;
  trackingCode: string;
  totalAmount: string;
  currency: string;
  contactName: string;
  phone: string;
  awaitingCardPayment: boolean;
  highlight: boolean;
}

/**
 * Sipariş linki: takip kodu içeren bağlantı giriş gerektirmeden sipariş sayfasını açar;
 * kartla ödeme adımı müşterinin kendi hesabıyla giriş yapmasını ister.
 */
export function OrderShareLinks(props: OrderShareLinksProps) {
  const [copied, setCopied] = useState<"" | "link" | "message">("");
  const [error, setError] = useState("");
  const orderUrl = `${props.siteUrl}/orders/${encodeURIComponent(props.trackingCode)}`;
  const message = [
    `Merhaba ${props.contactName},`,
    `${props.orderNo} numaralı siparişiniz oluşturuldu.`,
    `Tutar: ${props.totalAmount} ${props.currency} (KDV dahil)`,
    "",
    `Sipariş detayı: ${orderUrl}`,
    ...(props.awaitingCardPayment
      ? ["", "Kartla ödemek için bağlantıyı açıp bayi hesabınızla giriş yaptıktan sonra “Kartla Öde” butonunu kullanın."]
      : []),
    "",
    "ENTAŞBURADA"
  ].join("\n");
  const phoneDigits = props.phone.replace(/\D+/g, "");
  const international = phoneDigits.startsWith("0") ? `9${phoneDigits}` : phoneDigits.startsWith("5") ? `90${phoneDigits}` : phoneDigits;
  const whatsappHref = `https://wa.me/${international.length >= 12 ? international : ""}?text=${encodeURIComponent(message)}`;

  async function copy(kind: "link" | "message") {
    try {
      await navigator.clipboard.writeText(kind === "link" ? orderUrl : message);
      setCopied(kind);
      setError("");
      window.setTimeout(() => setCopied(""), 2500);
    } catch {
      setError("Panoya kopyalanamadı; bağlantıyı elle seçip kopyalayın.");
    }
  }

  return (
    <section className={`panel orderShareLinks${props.highlight ? " highlight" : ""}`} id="siparis-linki">
      <div className="panelHeader compact">
        <div>
          <h2>
            <Link2 size={19} aria-hidden="true" /> Müşteriye sipariş linki gönder
          </h2>
          <p>
            Bağlantı giriş gerektirmeden sipariş durumunu ve ürünleri gösterir.
            {props.awaitingCardPayment ? " Kartla ödeme için müşteri kendi hesabıyla giriş yapar." : ""}
          </p>
        </div>
      </div>
      <div className="orderShareLinkRow">
        <input readOnly value={orderUrl} aria-label="Sipariş linki" onFocus={(event) => event.currentTarget.select()} />
        <button type="button" className="btn btnGhost dark" onClick={() => copy("link")}>
          {copied === "link" ? <Check size={16} aria-hidden="true" /> : <Copy size={16} aria-hidden="true" />}
          {copied === "link" ? "Kopyalandı" : "Linki kopyala"}
        </button>
        <a className="btn btnGhost dark" href={orderUrl} target="_blank" rel="noreferrer">
          <ExternalLink size={16} aria-hidden="true" /> Aç
        </a>
      </div>
      <div className="orderShareActions">
        <a className="btn btnPrimary" href={whatsappHref} target="_blank" rel="noreferrer">
          <MessageCircle size={17} aria-hidden="true" /> WhatsApp ile gönder
        </a>
        <button type="button" className="btn btnGhost dark" onClick={() => copy("message")}>
          {copied === "message" ? <Check size={16} aria-hidden="true" /> : <Copy size={16} aria-hidden="true" />}
          {copied === "message" ? "Mesaj kopyalandı" : "Mesajı kopyala"}
        </button>
        {props.awaitingCardPayment ? (
          <span className="orderShareHint">
            <CreditCard size={16} aria-hidden="true" /> Sipariş “Ödeme bekliyor” durumunda; sayfada “Kartla Öde” butonu görünür.
          </span>
        ) : null}
      </div>
      {error ? <p className="formError">{error}</p> : null}
    </section>
  );
}
