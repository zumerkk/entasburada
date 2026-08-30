"use client";

import { useState } from "react";
import { Check, Copy, KeyRound, LoaderCircle, RefreshCw } from "lucide-react";

export function SellerCredentialActions({ customerId, apiEnabled, apiKeyPrefix }: { customerId: string; apiEnabled: boolean; apiKeyPrefix?: string }) {
  const [busy, setBusy] = useState<"api" | "password" | null>(null);
  const [credential, setCredential] = useState<{ label: string; value: string } | null>(null);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  async function generate(kind: "api" | "password") {
    setBusy(kind);
    setError("");
    setCredential(null);
    setCopied(false);
    try {
      const response = await fetch("/api/admin/dealers/accounts", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customerId, rotateApiKey: kind === "api", resetPassword: kind === "password" })
      });
      const payload = await response.json() as { apiKey?: string; temporaryPassword?: string; error?: string };
      if (!response.ok) throw new Error(payload.error || "Bilgi üretilemedi.");
      const value = kind === "api" ? payload.apiKey : payload.temporaryPassword;
      if (!value) throw new Error("Yeni bilgi yanıtta bulunamadı.");
      setCredential({ label: kind === "api" ? "Yeni API anahtarı" : "Yeni geçici şifre", value });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Bilgi üretilemedi.");
    } finally {
      setBusy(null);
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
        <button className="btn btnGhost dark btnSmall" type="button" disabled={!apiEnabled || busy !== null} onClick={() => generate("api")}>
          {busy === "api" ? <LoaderCircle className="spin" size={14} /> : <RefreshCw size={14} />} API anahtarı yenile
        </button>
        <button className="btn btnGhost dark btnSmall" type="button" disabled={busy !== null} onClick={() => generate("password")}>
          {busy === "password" ? <LoaderCircle className="spin" size={14} /> : <KeyRound size={14} />} Geçici şifre üret
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
