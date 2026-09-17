"use client";
import { useState } from "react";
import { Copy, Link2 } from "lucide-react";
export function SellerReference({ code }: { code: string }) {
  const [message, setMessage] = useState("");
  async function copy(link: boolean) {
    try {
      await navigator.clipboard.writeText(
        link
          ? `${window.location.origin}/dealer-application?ref=${encodeURIComponent(code)}`
          : code,
      );
      setMessage(
        link ? "Referans bağlantısı kopyalandı." : "Referans kodu kopyalandı.",
      );
    } catch {
      setMessage("Kopyalanamadı. Referans kodunu seçerek kopyalayabilirsiniz.");
    }
  }
  return (
    <div className="referralCodeCard">
      <span>SİZE ÖZEL REFERANS KODU</span>
      <strong>{code}</strong>
      <div>
        <button type="button" onClick={() => copy(false)}>
          <Copy size={15} /> Kodu kopyala
        </button>
        <button type="button" onClick={() => copy(true)}>
          <Link2 size={15} /> Bağlantıyı kopyala
        </button>
      </div>
      <small role="status">
        {message || "Bu kodla gelen müşteriler hesabınıza bağlanır."}
      </small>
    </div>
  );
}
