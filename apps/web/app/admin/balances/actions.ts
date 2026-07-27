"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getAdminEmail, requireAdmin } from "../../../lib/admin-auth";
import { addLedgerEntry } from "../../../lib/customer-balance-repository";
import { getCustomers } from "../../../lib/customer-auth";
import type { LedgerEntryType } from "../../../lib/customer-balance-policy";

export async function addLedgerEntryAction(formData: FormData): Promise<void> {
  await requireAdmin();

  const customerId = getString(formData, "customerId");
  const type = getString(formData, "type") as LedgerEntryType;
  const amount = getString(formData, "amount");
  const description = getString(formData, "description");
  const date = getString(formData, "date");

  const back = (message: string, ok: boolean) =>
    redirect(`/admin/balances?customer=${encodeURIComponent(customerId)}&${ok ? "ok" : "error"}=${encodeURIComponent(message)}`);

  const customers = await getCustomers();
  const customer = customers.find((entry) => entry.id === customerId);
  if (!customer) {
    back("Bayi bulunamadı.", false);
    return;
  }
  if (type !== "debit" && type !== "credit") {
    back("İşlem türü seçilmelidir.", false);
    return;
  }

  try {
    await addLedgerEntry({
      customerId,
      type,
      amount,
      description,
      date: date || undefined,
      refType: "manual",
      createdBy: getAdminEmail()
    });
  } catch (error) {
    back(error instanceof Error ? error.message : "Kayıt eklenemedi.", false);
    return;
  }

  revalidatePath("/admin/balances");
  revalidatePath("/account");
  back(`${type === "debit" ? "Borç" : "Alacak"} kaydı eklendi.`, true);
}

function getString(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}
