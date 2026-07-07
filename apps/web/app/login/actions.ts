"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { authenticateCustomer, CUSTOMER_COOKIE } from "../../lib/customer-auth";

export async function customerLoginAction(formData: FormData): Promise<void> {
  const email = getString(formData, "email");
  const password = getString(formData, "password");
  const next = getString(formData, "next") || "/account";
  const customer = await authenticateCustomer(email, password);

  if (!customer || customer.status !== "approved") {
    redirect(`/login?error=${encodeURIComponent("E-posta veya sifre hatali.")}`);
  }

  const cookieStore = await cookies();
  cookieStore.set(CUSTOMER_COOKIE, customer.id, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 14
  });

  redirect(next.startsWith("/") ? next : "/account");
}

export async function customerLogoutAction(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(CUSTOMER_COOKIE);
  redirect("/login");
}

function getString(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}
