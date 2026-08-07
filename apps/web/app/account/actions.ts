"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { changeCustomerPassword, requireCustomer } from "../../lib/customer-auth";
import { toggleFavorite } from "../../lib/favorites-repository";
import { safeInternalRedirect } from "../../lib/security";
import { subscribeToStock, unsubscribeFromStock } from "../../lib/stock-notify-repository";

/**
 * Favori ekler/çıkarır. `redirectTo` verilirse oraya, yoksa /account#favorites'e döner.
 * Sadece giriş yapmış müşteri için (requireCustomer).
 */
export async function toggleFavoriteAction(formData: FormData): Promise<void> {
  const customer = await requireCustomer();
  const sku = String(formData.get("sku") ?? "").trim();
  const productName = String(formData.get("productName") ?? "").trim();
  const productSlug = String(formData.get("productSlug") ?? "").trim();
  const redirectTo = String(formData.get("redirectTo") ?? "").trim();

  if (sku) {
    await toggleFavorite({ customerId: customer.id, sku, productName, productSlug });
  }

  revalidatePath("/account");
  redirect(safeInternalRedirect(redirectTo, "/account#favorites"));
}

/** "Stok gelince haber ver" — müşteri ürüne abone olur. */
export async function subscribeStockAction(formData: FormData): Promise<void> {
  const customer = await requireCustomer();
  const sku = String(formData.get("sku") ?? "").trim();
  const productName = String(formData.get("productName") ?? "").trim();
  const productSlug = String(formData.get("productSlug") ?? "").trim();
  const redirectTo = String(formData.get("redirectTo") ?? "").trim();

  if (sku) {
    await subscribeToStock({ customerId: customer.id, email: customer.email, sku, productName, productSlug });
  }
  revalidatePath("/account");
  redirect(safeInternalRedirect(redirectTo, "/account#stock-alerts"));
}

/** Stok bildirim aboneliğini iptal eder. */
export async function unsubscribeStockAction(formData: FormData): Promise<void> {
  const customer = await requireCustomer();
  const sku = String(formData.get("sku") ?? "").trim();
  const productSlug = String(formData.get("productSlug") ?? "").trim();
  const redirectTo = String(formData.get("redirectTo") ?? "").trim();
  if (sku) {
    await unsubscribeFromStock(customer.id, sku, productSlug);
  }
  revalidatePath("/account");
  redirect(safeInternalRedirect(redirectTo, "/account#stock-alerts"));
}

export async function changePasswordAction(formData: FormData): Promise<void> {
  const customer = await requireCustomer({ allowPasswordChangeRequired: true });
  const currentPassword = String(formData.get("currentPassword") ?? "");
  const newPassword = String(formData.get("newPassword") ?? "");
  const newPasswordRepeat = String(formData.get("newPasswordRepeat") ?? "");

  if (newPassword !== newPasswordRepeat) {
    redirect(`/account?passwordError=${encodeURIComponent("Yeni şifreler birbiriyle uyuşmuyor.")}#security`);
  }

  try {
    await changeCustomerPassword(customer.id, currentPassword, newPassword);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Şifre değiştirilemedi.";
    redirect(`/account?passwordError=${encodeURIComponent(message)}#security`);
  }

  redirect("/account?passwordChanged=1#security");
}
