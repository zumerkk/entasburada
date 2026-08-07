import { afterEach, describe, expect, it } from "vitest";
import { assertProductionSecurityConfiguration, constantTimeEqual, readBodyText, RequestSecurityError, safeInternalRedirect, trustedMutationError, validatePasswordStrength } from "./security";

// /api/health bu kontrolu cagirir ve patlarsa 503 doner; Render saglik kontrolu 503'te
// deploy'u canliya almaz. Yani buradaki her zorunluluk dogrudan bir kesinti riskidir.
describe("production güvenlik yapılandırması", () => {
  const saved = { ...process.env };
  afterEach(() => {
    for (const key of Object.keys(process.env)) if (!(key in saved)) delete process.env[key];
    Object.assign(process.env, saved);
  });

  function applyBaseEnv(totpSecret: string | undefined): void {
    Object.assign(process.env, {
      NODE_ENV: "production",
      AUTH_SECRET: "a".repeat(64),
      ADMIN_SESSION_SECRET: "b".repeat(64),
      ADMIN_EMAIL: "admin@entasburada.com",
      ADMIN_PASSWORD: "Cok-Guclu-Parola-2026!",
      NEXT_PUBLIC_SITE_URL: "https://entasburada.com"
    });
    if (totpSecret === undefined) delete process.env.ADMIN_TOTP_SECRET;
    else process.env.ADMIN_TOTP_SECRET = totpSecret;
  }

  it("TOTP anahtarı tanımlı değilken geçer (ikinci faktör opsiyoneldir)", () => {
    applyBaseEnv(undefined);
    expect(() => assertProductionSecurityConfiguration()).not.toThrow();
  });

  it("geçerli TOTP anahtarını kabul eder", () => {
    applyBaseEnv("PKBFLT2Y57BXBHIEG5MGQ75VDSF7JMFG");
    expect(() => assertProductionSecurityConfiguration()).not.toThrow();
  });

  it("bozuk TOTP anahtarını reddeder; yazım hatası sessizce 2FA'yı kapatamaz", () => {
    for (const invalid of ["kisa!!", "PKBFLT2Y57BXBHIEG5MGQ75VDSF7JMF", "PKBFLT2Y57BXBHIEG5MGQ75VDSF7JMF!"]) {
      applyBaseEnv(invalid);
      expect(() => assertProductionSecurityConfiguration()).toThrow();
    }
  });

  it("oturum anahtarları kısa veya aynı olduğunda reddeder", () => {
    applyBaseEnv(undefined);
    process.env.ADMIN_SESSION_SECRET = "kisa";
    expect(() => assertProductionSecurityConfiguration()).toThrow();
    applyBaseEnv(undefined);
    process.env.ADMIN_SESSION_SECRET = process.env.AUTH_SECRET;
    expect(() => assertProductionSecurityConfiguration()).toThrow();
  });
});

describe("security helpers", () => {
  it("only accepts same-origin relative redirects", () => {
    expect(safeInternalRedirect("/account?tab=1#security", "/account")).toBe("/account?tab=1#security");
    for (const value of ["//evil.example", "/\\evil.example", "https://evil.example", "javascript:alert(1)"]) {
      expect(safeInternalRedirect(value, "/account")).toBe("/account");
    }
  });

  it("compares secrets without returning true for unequal lengths", () => {
    expect(constantTimeEqual("same", "same")).toBe(true);
    expect(constantTimeEqual("same", "different")).toBe(false);
  });

  it("enforces a bounded request body for chunked requests", async () => {
    const request = new Request("https://entasburada.com/api/test", { method: "POST", body: "123456" });
    await expect(readBodyText(request, 5)).rejects.toMatchObject({ status: 413 } satisfies Partial<RequestSecurityError>);
  });

  it("rejects cross-site mutations and accepts the configured origin", () => {
    const rejected = new Request("https://entasburada.com/api/test", {
      method: "POST",
      headers: { origin: "https://evil.example", "sec-fetch-site": "cross-site" }
    });
    expect(trustedMutationError(rejected)?.status).toBe(403);

    const accepted = new Request("https://entasburada.com/api/test", {
      method: "POST",
      headers: { origin: "https://entasburada.com", "sec-fetch-site": "same-origin" }
    });
    expect(trustedMutationError(accepted)).toBeNull();
  });

  it("requires a strong customer password", () => {
    expect(validatePasswordStrength("weakpassword")).not.toBeNull();
    expect(validatePasswordStrength("Güçlü-Şifre-2026!")).toBeNull();
  });
});
