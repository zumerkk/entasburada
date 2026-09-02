"use client";

import { useState } from "react";
import { Check, Copy, LoaderCircle, RefreshCw } from "lucide-react";

export function SellerCredentialActions({ customerId, apiEnabled, apiKeyPrefix }: { customerId: string; apiEnabled: boolean; apiKeyPrefix?: string }) {
  const [busy, setBusy] = useState(false);
  const [credential, setCredential] = useState<{ label: string; value: string } | null>(null);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  async function rotateApiKey() {
    const confirmed = window.confirm("API anahtarı yenilensin mi? Mevcut anahtarı kullanan entegrasyonlar hemen duracaktır.");
    if (!confirmed) return;
    setBusy(true);
    setError("");
    setCredential(null);
    setCopied(false);
    try {
      const response = await fetch("/api/admin/dealers/accounts", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customerId, rotateApiKey: true })
      });
      const payload = await response.json() as { apiKey?: string; error?: string };
      if (!response.ok) throw new Error(payload.error || "Bilgi üretilemedi.");
      if (!payload.apiKey) throw new Error("Yeni API anahtarı yanıtta bulunamadı.");
      setCredential({ label: "Yeni API anahtarı", value: payload.apiKey });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Bilgi üretilemedi.");
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    if (!credential) return;
    await navigator.clipboard.writeText(credential.value);
    setCopied(true);
  }

  return (
    <div className="sellerCredentialActions">
      <div className="sellerCredentialButtons">
        <button className="btn btnGhost dark btnSmall" type="button" disabled={!apiEnabled || busy} onClick={rotateApiKey}>
          {busy ? <LoaderCircle className="spin" size={14} /> : <RefreshCw size={14} />} API anahtarı yenile
        </button>
      </div>
      {apiKeyPrefix ? <small>Mevcut anahtar: {apiKeyPrefix}…</small> : <small>Henüz API anahtarı üretilmedi.</small>}
      {error ? <p className="formError">{error}</p> : null}
      {credential ? (
        <div className="sellerCredentialInline">
          <span>{credential.label}</span><code>{credential.value}</code>
          <button className="btn btnSecondary btnSmall" type="button" onClick={copy}>{copied ? <Check size={14} /> : <Copy size={14} />} {copied ? "Kopyalandı" : "Kopyala"}</button>
        </div>
      ) : null}
    </div>
  );
}
