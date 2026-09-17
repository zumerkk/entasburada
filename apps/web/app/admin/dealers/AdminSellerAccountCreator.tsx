"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Check, Copy, KeyRound, LoaderCircle, Store } from "lucide-react";

interface CreateResult {
  status?: "created" | "already-exists";
  email?: string;
  temporaryPassword?: string;
  apiKey?: string;
  mailSent?: boolean;
  error?: string;
}

export function AdminSellerAccountCreator() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<CreateResult | null>(null);
  const [copied, setCopied] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setResult(null);
    setCopied(false);
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const mode = String(form.get("mode") || "hybrid");
    const body = {
      email: String(form.get("email") || ""),
      companyName: String(form.get("companyName") || ""),
      authorizedPerson: String(form.get("authorizedPerson") || ""),
      phone: String(form.get("phone") || ""),
      city: String(form.get("city") || ""),
      deliveryAddress: String(form.get("deliveryAddress") || ""),
      segment: String(form.get("segment") || "standard"),
      sendWelcomeEmail: form.get("sendWelcomeEmail") === "on",
      createApiKey: form.get("apiEnabled") === "on",
      sellerAccess: {
        enabled: true,
        mode,
        productFeedEnabled: form.get("productFeedEnabled") === "on",
        apiEnabled: form.get("apiEnabled") === "on",
        exactStockEnabled: form.get("exactStockEnabled") === "on",
        orderApiEnabled: form.get("orderApiEnabled") === "on",
        blindShippingEnabled: form.get("blindShippingEnabled") === "on",
        defaultMarkupRate: Number(form.get("defaultMarkupRate") || 30)
      }
    };

    try {
      const response = await fetch("/api/admin/dealers/accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      const payload = await response.json() as CreateResult;
      if (!response.ok) throw new Error(payload.error || "Satıcı hesabı oluşturulamadı.");
      setResult(payload);
      if (payload.status === "created") {
        formElement.reset();
        router.refresh();
      }
    } catch (error) {
      setResult({ error: error instanceof Error ? error.message : "Satıcı hesabı oluşturulamadı." });
    } finally {
      setBusy(false);
    }
  }

  async function copyCredentials() {
    if (!result?.email) return;
    const value = [
      "ENTAŞBURADA Yetkili Paneli",
      "Giriş: https://entasburada.com/login",
      `Kullanıcı: ${result.email}`,
      result.temporaryPassword ? `Geçici şifre: ${result.temporaryPassword}` : "",
      result.apiKey ? `API anahtarı: ${result.apiKey}` : ""
    ].filter(Boolean).join("\n");
    await navigator.clipboard.writeText(value);
    setCopied(true);
  }

  return (
    <details className="sellerAdminCreate" open>
      <summary><Store size={17} aria-hidden="true" /> Doğrudan satıcı / dropshipping hesabı aç</summary>
      <form className="sellerAdminForm" onSubmit={submit}>
        <label>Firma adı *<input name="companyName" required minLength={2} maxLength={160} /></label>
        <label>Yetkili kişi *<input name="authorizedPerson" required minLength={2} maxLength={120} /></label>
        <label>E-posta / kullanıcı adı *<input name="email" type="email" required /></label>
        <label>Telefon *<input name="phone" type="tel" required minLength={10} /></label>
        <label>İl *<input name="city" required minLength={2} /></label>
        <label>Hesap tipi
          <select name="mode" defaultValue="hybrid">
            <option value="reseller">Al-sat bayi</option>
            <option value="dropshipping">Dropshipping</option>
            <option value="hybrid">Al-sat + dropshipping</option>
          </select>
        </label>
        <label>Hizmet segmenti
          <select name="segment" defaultValue="standard">
            <option value="standard">Standart</option>
            <option value="industrial">Sanayi</option>
            <option value="project">Proje</option>
          </select>
        </label>
        <label>Önerilen mağaza kârı (%)<input name="defaultMarkupRate" type="number" min="0" max="500" step="0.1" defaultValue="30" /></label>
        <p className="sellerPricingPolicyNote"><strong>Müşteri referansı:</strong> Bu hesap kendi referansıyla getirdiği müşterilerin ürün satışlarından %10 komisyon kazanır. Bu oran mağaza kârından bağımsızdır. <strong>Satıcı kanal alış fiyatı:</strong> standart bayi net fiyatının %20 üzeridir. Önerilen mağaza kârı bu alış fiyatının üzerine ayrıca hesaplanır.</p>
        <label className="spanTwo">Varsayılan teslimat adresi *<textarea name="deliveryAddress" required minLength={10} rows={2} /></label>
        <div className="sellerPermissionGrid spanTwo">
          <label><input type="checkbox" name="productFeedEnabled" defaultChecked /> Ürün beslemesi</label>
          <label><input type="checkbox" name="exactStockEnabled" defaultChecked /> Net stok adedi</label>
          <label><input type="checkbox" name="apiEnabled" defaultChecked /> API erişimi</label>
          <label><input type="checkbox" name="orderApiEnabled" defaultChecked /> API ile sipariş</label>
          <label><input type="checkbox" name="blindShippingEnabled" defaultChecked /> Kör kargo</label>
          <label><input type="checkbox" name="sendWelcomeEmail" defaultChecked /> Giriş e-postası</label>
        </div>
        <button className="btn btnPrimary" type="submit" disabled={busy}>
          {busy ? <LoaderCircle className="spin" size={17} /> : <KeyRound size={17} />}
          {busy ? "Hesap açılıyor" : "Hesabı ve bilgileri oluştur"}
        </button>
      </form>
      {result?.error ? <p className="formError">{result.error}</p> : null}
      {result?.status === "already-exists" ? <p className="formError">Bu e-posta ile hesap zaten var; mevcut hesabı aşağıdaki listeden yönetin.</p> : null}
      {result?.status === "created" ? (
        <div className="sellerCredentialResult" role="status">
          <div><Check size={18} /><strong>Hesap açıldı — bu bilgileri şimdi güvenli biçimde iletin</strong></div>
          <code>Kullanıcı: {result.email}{"\n"}Geçici şifre: {result.temporaryPassword}{result.apiKey ? `\nAPI anahtarı: ${result.apiKey}` : ""}</code>
          <small>Şifre ve API anahtarı daha sonra düz metin olarak görüntülenmez. Gerekirse yenisini üretin.</small>
          <button className="btn btnSecondary btnSmall" type="button" onClick={copyCredentials}>
            {copied ? <Check size={15} /> : <Copy size={15} />} {copied ? "Kopyalandı" : "Bilgileri kopyala"}
          </button>
        </div>
      ) : null}
    </details>
  );
}
