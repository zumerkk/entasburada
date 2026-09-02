"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Check, Copy, KeyRound, LoaderCircle, ShieldCheck, X } from "lucide-react";

interface DealerPasswordResetActionProps {
  customerId: string;
  companyName: string;
  email: string;
}

export function DealerPasswordResetAction({ customerId, companyName, email }: DealerPasswordResetActionProps) {
  const titleId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const [busy, setBusy] = useState(false);
  const [temporaryPassword, setTemporaryPassword] = useState("");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!temporaryPassword) return;
    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setTemporaryPassword("");
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", closeOnEscape);
    closeRef.current?.focus();
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
      triggerRef.current?.focus();
    };
  }, [temporaryPassword]);

  async function resetPassword() {
    const confirmed = window.confirm(
      `${companyName} hesabının şifresi sıfırlansın mı? Eski şifre ve açık bayi oturumları geçersiz olacaktır.`
    );
    if (!confirmed) return;

    setBusy(true);
    setError("");
    setCopied(false);
    try {
      const response = await fetch("/api/admin/dealers/accounts", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customerId, resetPassword: true })
      });
      const payload = await response.json() as { temporaryPassword?: string; error?: string };
      if (!response.ok) throw new Error(payload.error || "Şifre sıfırlanamadı.");
      if (!payload.temporaryPassword) throw new Error("Geçici şifre yanıtta bulunamadı.");
      setTemporaryPassword(payload.temporaryPassword);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Şifre sıfırlanamadı.");
    } finally {
      setBusy(false);
    }
  }

  async function copyLoginDetails() {
    const details = [
      "ENTAŞBURADA bayi giriş bilgileri",
      "Giriş: https://entasburada.com/login",
      `E-posta: ${email}`,
      `Geçici şifre: ${temporaryPassword}`,
      "İlk girişte yeni bir şifre belirlemeniz istenecektir."
    ].join("\n");

    try {
      await navigator.clipboard.writeText(details);
      setCopied(true);
      setError("");
    } catch {
      setError("Panoya kopyalanamadı. Bilgileri elle kopyalayabilirsiniz.");
    }
  }

  return (
    <div className="dealerPasswordResetAction">
      <button
        ref={triggerRef}
        className="btn btnGhost dark btnSmall dealerPasswordResetButton"
        type="button"
        disabled={busy}
        onClick={resetPassword}
        aria-label={`${companyName} hesabının şifresini sıfırla`}
      >
        {busy ? <LoaderCircle className="spin" size={14} aria-hidden="true" /> : <KeyRound size={14} aria-hidden="true" />}
        {busy ? "Sıfırlanıyor" : "Şifreyi sıfırla"}
      </button>
      {error && !temporaryPassword ? <small className="dealerPasswordResetError" role="alert">{error}</small> : null}

      {temporaryPassword ? (
        <div
          className="dealerPasswordResetBackdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setTemporaryPassword("");
          }}
        >
          <section className="dealerPasswordResetDialog" role="dialog" aria-modal="true" aria-labelledby={titleId}>
            <button ref={closeRef} className="dealerPasswordResetClose" type="button" onClick={() => setTemporaryPassword("")} aria-label="Pencereyi kapat">
              <X size={18} aria-hidden="true" />
            </button>
            <div className="dealerPasswordResetIcon"><ShieldCheck size={26} aria-hidden="true" /></div>
            <span className="dealerPasswordResetEyebrow">Şifre başarıyla sıfırlandı</span>
            <h2 id={titleId}>{companyName}</h2>
            <p>Eski şifre ve açık bayi oturumları geçersiz oldu. Aşağıdaki geçici şifre, ilk girişte değiştirilmek zorundadır.</p>
            <div className="dealerPasswordResetCredentials">
              <span>E-posta</span>
              <strong>{email}</strong>
              <span>Geçici şifre</span>
              <code>{temporaryPassword}</code>
            </div>
            {error ? <p className="formError" role="alert">{error}</p> : null}
            <div className="dealerPasswordResetDialogActions">
              <button className="btn btnPrimary" type="button" onClick={copyLoginDetails}>
                {copied ? <Check size={16} aria-hidden="true" /> : <Copy size={16} aria-hidden="true" />}
                {copied ? "Giriş bilgileri kopyalandı" : "Giriş bilgilerini kopyala"}
              </button>
              <button className="btn btnGhost dark" type="button" onClick={() => setTemporaryPassword("")}>Kapat</button>
            </div>
            <small>Güvenlik nedeniyle bu geçici şifre yalnızca bu ekranda bir kez gösterilir.</small>
          </section>
        </div>
      ) : null}
    </div>
  );
}
