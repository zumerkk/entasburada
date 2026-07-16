"use server";

import { redirect } from "next/navigation";
import { changeCustomerPassword, requireCustomer } from "../../lib/customer-auth";

export async function changePasswordAction(formData: FormData): Promise<void> {
  const customer = await requireCustomer();
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
