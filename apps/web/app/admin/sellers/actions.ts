"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin, getAdminEmail } from "../../../lib/admin-auth";
import { updateSellerCommission } from "../../../lib/commercial-repository";
export async function commissionAction(form: FormData) {
  await requireAdmin();
  const operation = String(form.get("operation"));
  if (!["settle", "refund", "recover"].includes(operation))
    redirect("/admin/sellers?error=Geçersiz işlem");
  try {
    await updateSellerCommission(
      {
        orderId: String(form.get("orderId")),
        revision: Number(form.get("revision")),
        operation: operation as "settle" | "refund" | "recover",
        itemId: String(form.get("itemId") ?? ""),
        quantity: Number(form.get("quantity")),
        reference: String(form.get("reference") ?? ""),
      },
      getAdminEmail(),
    );
  } catch (error) {
    redirect(
      `/admin/sellers?error=${encodeURIComponent(error instanceof Error ? error.message : "İşlem başarısız")}`,
    );
  }
  revalidatePath("/satici");
  revalidatePath("/admin/sellers");
  redirect("/admin/sellers?ok=1");
}
