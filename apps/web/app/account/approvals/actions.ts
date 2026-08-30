"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { respondToCompanyOrderApproval } from "../../../lib/commercial-repository";
import { requireCustomer } from "../../../lib/customer-auth";

export async function respondCompanyOrderAction(formData: FormData): Promise<void> {
  const customer = await requireCustomer();
  const approved = value(formData, "decision") === "approve";
  let trackingCode = "";
  try {
    const order = await respondToCompanyOrderApproval(value(formData, "orderId"), customer, approved, value(formData, "note"));
    trackingCode = order.trackingCode;
  } catch (error) { redirect(`/account/approvals?error=${encodeURIComponent(error instanceof Error ? error.message : "Sipariş yanıtlanamadı.")}`); }
  revalidatePath("/account/approvals"); revalidatePath("/account"); revalidatePath(`/orders/${trackingCode}`); revalidatePath("/admin/orders");
  redirect(`/account/approvals?ok=${encodeURIComponent(approved ? "Sipariş onaylandı." : "Sipariş reddedildi.")}`);
}
function value(formData: FormData, key: string) { const raw = formData.get(key); return typeof raw === "string" ? raw.trim() : ""; }
