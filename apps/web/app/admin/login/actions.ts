"use server";

import { cookies } from "next/headers";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { ADMIN_COOKIE, createAdminSession, verifyAdminCredentials } from "../../../lib/admin-auth";
import { clearRateLimit, consumeRateLimit } from "../../../lib/rate-limit";
import { getClientAddress } from "../../../lib/security";

export async function loginAction(formData: FormData): Promise<void> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const totpCode = String(formData.get("totp") ?? "").trim();
  const requestHeaders = await headers();
  const clientAddress = getClientAddress(requestHeaders);
  const ipLimit = await consumeRateLimit("admin-login-ip", clientAddress, { limit: 8, windowMs: 15 * 60 * 1000 });
  const accountLimit = await consumeRateLimit("admin-login-account", email || "empty", { limit: 8, windowMs: 15 * 60 * 1000 });

  if (!ipLimit.allowed || !accountLimit.allowed) {
    redirect("/admin/login?error=rate");
  }

  if (!verifyAdminCredentials(email, password, totpCode)) {
    redirect("/admin/login?error=1");
  }

  if (process.env.ADMIN_TOTP_SECRET) {
    const replayLimit = await consumeRateLimit("admin-totp-replay", `${email}:${totpCode}`, { limit: 1, windowMs: 90 * 1000 });
    if (!replayLimit.allowed) redirect("/admin/login?error=1");
  }

  await Promise.all([
    clearRateLimit("admin-login-ip", clientAddress),
    clearRateLimit("admin-login-account", email)
  ]);

  const cookieStore = await cookies();
  cookieStore.set(ADMIN_COOKIE, createAdminSession(), {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 8
  });

  redirect("/admin");
}

export async function logoutAction(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(ADMIN_COOKIE, "", { httpOnly: true, sameSite: "strict", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 0 });
  redirect("/admin/login");
}
