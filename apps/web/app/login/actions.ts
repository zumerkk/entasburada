"use server";

import { cookies } from "next/headers";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { authenticateCustomer, createCustomerSessionToken, CUSTOMER_COOKIE, CUSTOMER_SESSION_MAX_AGE_SECONDS } from "../../lib/customer-auth";
import { clearRateLimit, consumeRateLimit } from "../../lib/rate-limit";
import { getClientAddress, safeInternalRedirect } from "../../lib/security";

export async function customerLoginAction(formData: FormData): Promise<void> {
  const email = getString(formData, "email");
  const password = getString(formData, "password");
  const next = getString(formData, "next") || "/account";
  const requestHeaders = await headers();
  const clientAddress = getClientAddress(requestHeaders);
  const ipLimit = await consumeRateLimit("customer-login-ip", clientAddress, { limit: 12, windowMs: 15 * 60 * 1000 });
  const accountLimit = await consumeRateLimit("customer-login-account", email || "empty", { limit: 8, windowMs: 15 * 60 * 1000 });
  if (!ipLimit.allowed || !accountLimit.allowed) {
    redirect(`/login?error=${encodeURIComponent("Çok fazla deneme yapıldı. Lütfen daha sonra tekrar deneyin.")}`);
  }
  const customer = await authenticateCustomer(email, password);

  if (!customer || customer.status !== "approved") {
    redirect(`/login?error=${encodeURIComponent("E-posta veya sifre hatali.")}`);
  }

  await Promise.all([
    clearRateLimit("customer-login-ip", clientAddress),
    clearRateLimit("customer-login-account", email)
  ]);

  const cookieStore = await cookies();
  cookieStore.set(CUSTOMER_COOKIE, createCustomerSessionToken(customer), {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: CUSTOMER_SESSION_MAX_AGE_SECONDS
  });

  redirect(customer.mustChangePassword ? "/account?passwordChangeRequired=1#security" : safeInternalRedirect(next, "/account"));
}

export async function customerLogoutAction(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(CUSTOMER_COOKIE, "", { httpOnly: true, sameSite: "strict", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 0 });
  redirect("/login");
}

function getString(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}
