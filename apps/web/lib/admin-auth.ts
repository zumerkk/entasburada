import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { verifyPassword } from "./password-hash";
import { constantTimeEqual } from "./security";
import { createSessionToken, verifySessionToken } from "./session-token";
import { verifyTotp } from "./admin-totp";

export const ADMIN_COOKIE = process.env.NODE_ENV === "production" ? "__Host-entas_admin_session" : "entas_admin_session";
const ADMIN_SESSION_MAX_AGE_SECONDS = 60 * 60 * 8;

export function getAdminEmail(): string {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  if (email) return email;
  if (process.env.NODE_ENV === "production") throw new Error("ADMIN_EMAIL production ortamında zorunludur.");
  return "admin@entasburada.local";
}

export function verifyAdminCredentials(email: string, password: string, totpCode: string): boolean {
  const expectedEmail = getAdminEmail();
  const emailMatches = constantTimeEqual(email.trim().toLowerCase(), expectedEmail);
  const configuredHash = process.env.ADMIN_PASSWORD_HASH?.trim();
  const configuredPassword = process.env.ADMIN_PASSWORD ?? (process.env.NODE_ENV === "production" ? "" : "change-me-local-dev-only");

  if (process.env.NODE_ENV === "production" && !configuredHash && configuredPassword.length < 16) {
    throw new Error("Production admin parolası en az 16 karakter olmalı veya ADMIN_PASSWORD_HASH tanımlanmalıdır.");
  }

  const passwordMatches = configuredHash
    ? verifyPassword(password, configuredHash)
    : constantTimeEqual(password, configuredPassword);
  const totpSecret = process.env.ADMIN_TOTP_SECRET?.trim() ?? "";
  const totpMatches = totpSecret ? verifyTotp(totpCode, totpSecret) : true;
  return emailMatches && passwordMatches && totpMatches;
}

export function createAdminSession(): string {
  return createSessionToken(`admin:${getAdminEmail()}`, adminSessionSecret(), ADMIN_SESSION_MAX_AGE_SECONDS);
}

export async function isAdminAuthenticated(): Promise<boolean> {
  const cookieStore = await cookies();
  const subject = verifySessionToken(cookieStore.get(ADMIN_COOKIE)?.value ?? "", adminSessionSecret());
  return subject !== null && constantTimeEqual(subject, `admin:${getAdminEmail()}`);
}

export async function requireAdmin(): Promise<void> {
  if (!(await isAdminAuthenticated())) redirect("/admin/login");
}

function adminSessionSecret(): string {
  const secret = process.env.ADMIN_SESSION_SECRET?.trim();
  if (secret && (process.env.NODE_ENV !== "production" || secret.length >= 32)) return secret;
  if (process.env.NODE_ENV === "production") {
    throw new Error("ADMIN_SESSION_SECRET production ortamında en az 32 karakter olmalıdır.");
  }
  return "local-development-admin-session-secret-only";
}
