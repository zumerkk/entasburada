"use server";

import { approveOwnDealer } from "../../lib/seller-approval";
import { requireReferralSeller } from "../../lib/seller-dashboard";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { clearCart, loadPricedCart } from "../../lib/cart-repository";
import { requireCustomer } from "../../lib/customer-auth";
import { createSellerOrder } from "../../lib/reseller-order";

export async function createDropshipOrderFromCartAction(formData: FormData): Promise<void> {
  const customer = await requireCustomer();
  const cart = await loadPricedCart(customer);
  if (cart.items.length === 0) redirect("/satici/siparis?error=" + encodeURIComponent("Sepetiniz boş."));
  if (!cart.canCreateOrder) redirect("/satici/siparis?error=" + encodeURIComponent(cart.orderBlockReason || "Sepet siparişe uygun değil."));

  try {
    const result = await createSellerOrder(customer, {
      externalOrderId: getString(formData, "externalOrderId"),
      recipientName: getString(formData, "recipientName"),
      recipientPhone: getString(formData, "recipientPhone"),
      deliveryCity: getString(formData, "deliveryCity"),
      deliveryAddress: getString(formData, "deliveryAddress"),
      note: getString(formData, "note"),
      blindShipping: getString(formData, "blindShipping") === "on",
      items: cart.items.map((item) => ({ sku: item.sku, quantity: item.quantity }))
    });
    if (result.created) await clearCart(customer);
    revalidatePath("/satici");
    revalidatePath("/satici/siparis");
    revalidatePath("/cart");
    revalidatePath("/orders");
    revalidatePath("/admin/orders");
    redirect(`/orders/${encodeURIComponent(result.order.trackingCode)}`);
  } catch (error) {
    redirect("/satici/siparis?error=" + encodeURIComponent(error instanceof Error ? error.message : "Sipariş oluşturulamadı."));
  }
}

function getString(formData: FormData, key: string): string { const value = formData.get(key); return typeof value === "string" ? value.trim() : ""; }

export async function approveOwnDealerAction(form: FormData) {
  await requireReferralSeller();
  try { await approveOwnDealer(String(form.get("applicationId") ?? "")); }
  catch (error) { redirect(`/satici?error=${encodeURIComponent(error instanceof Error ? error.message : "Onay başarısız.")}`); }
  for (const path of ["/satici", "/admin/dealers", "/admin/sellers"]) revalidatePath(path);
  redirect("/satici?approved=1");
}
