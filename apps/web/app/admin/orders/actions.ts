"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getAdminEmail, requireAdmin } from "../../../lib/admin-auth";
import {
  createDirectOrder,
  deleteRejectedOrders,
  updateOrderItems,
  type DirectOrderPaymentMode
} from "../../../lib/commercial-repository";
import { getCustomers } from "../../../lib/customer-auth";
import { MAX_ORDER_LINE_QUANTITY } from "../../../lib/order-editing";

export interface AdminOrderFormState {
  error?: string;
  message?: string;
}

const catalogLinesSchema = z
  .array(z.object({ productId: z.string().trim().min(1).max(300), quantity: z.number().int().min(1).max(MAX_ORDER_LINE_QUANTITY) }))
  .max(200);
const itemChangesSchema = z
  .array(z.object({ itemId: z.string().trim().min(1).max(200), quantity: z.number().int().min(0).max(MAX_ORDER_LINE_QUANTITY) }))
  .max(500);
const paymentModes: DirectOrderPaymentMode[] = ["account", "transfer", "card"];

/** Admin'in bayi adına doğrudan sipariş açması; başarıda sipariş detayına (paylaşım linkleriyle) gider. */
export async function createAdminOrderAction(_previous: AdminOrderFormState, formData: FormData): Promise<AdminOrderFormState> {
  await requireAdmin();
  const customerId = getString(formData, "customerId");
  const lines = parseJsonField(formData, "lines", catalogLinesSchema);
  const paymentMode = getString(formData, "paymentMode") as DirectOrderPaymentMode;
  if (!customerId) return { error: "Önce siparişin açılacağı bayiyi seçin." };
  if (!lines) return { error: "Ürün satırları okunamadı. Sayfayı yenileyip tekrar deneyin." };
  if (lines.length === 0) return { error: "Siparişe en az bir ürün ekleyin." };
  if (!paymentModes.includes(paymentMode)) return { error: "Ödeme şeklini seçin." };

  const customer = (await getCustomers()).find((entry) => entry.id === customerId);
  if (!customer) return { error: "Seçilen bayi hesabı bulunamadı." };

  let orderId: string;
  try {
    const order = await createDirectOrder(
      {
        customer,
        lines,
        deliveryAddress: getString(formData, "deliveryAddress"),
        paymentMode,
        customerNote: getString(formData, "customerNote"),
        internalNote: getString(formData, "internalNote")
      },
      getAdminEmail()
    );
    orderId = order.id;
  } catch (error) {
    return { error: errorMessage(error, "Sipariş oluşturulamadı.") };
  }

  revalidateOrderPaths();
  redirect(`/admin/orders/${encodeURIComponent(orderId)}?created=1`);
}

/** Sipariş satırlarını düzeltir: adet değişikliği, satır çıkarma, katalogdan ürün ekleme. */
export async function updateOrderItemsAction(_previous: AdminOrderFormState, formData: FormData): Promise<AdminOrderFormState> {
  await requireAdmin();
  const orderId = getString(formData, "orderId");
  const changes = parseJsonField(formData, "changes", itemChangesSchema);
  const additions = parseJsonField(formData, "additions", catalogLinesSchema);
  if (!orderId || !changes || !additions) return { error: "Düzenleme verisi okunamadı. Sayfayı yenileyip tekrar deneyin." };

  try {
    const order = await updateOrderItems({ orderId, changes, additions, note: getString(formData, "note") }, getAdminEmail());
    revalidateOrderPaths(order.trackingCode);
    revalidatePath(`/admin/orders/${orderId}`);
    return { message: `Sipariş güncellendi. Yeni toplam: ${order.totalAmount} ${order.currency}.` };
  } catch (error) {
    return { error: errorMessage(error, "Sipariş güncellenemedi.") };
  }
}

/** Reddedilen/iptal siparişleri listeden kaldırır (arşive taşır). */
export async function deleteRejectedOrdersAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const orderIds = formData.getAll("orderId").map(String).filter(Boolean);
  let result: Awaited<ReturnType<typeof deleteRejectedOrders>> | null = null;
  let failure = "";
  try {
    result = await deleteRejectedOrders(orderIds, getAdminEmail());
  } catch (error) {
    failure = errorMessage(error, "Siparişler silinemedi.");
  }

  revalidateOrderPaths();
  const params = new URLSearchParams({ view: "rejected" });
  if (failure) {
    params.set("error", failure);
  } else if (result) {
    if (result.deleted.length) params.set("ok", `${result.deleted.length} reddedilen sipariş listeden silindi.`);
    if (result.skipped.length) {
      params.set("error", result.skipped.map((entry) => `${entry.orderNo}: ${entry.reason}`).join(" · "));
    }
  }
  redirect(`/admin/orders?${params.toString()}`);
}

function parseJsonField<T>(formData: FormData, key: string, schema: z.ZodType<T>): T | null {
  try {
    const parsed = schema.safeParse(JSON.parse(getString(formData, key) || "[]"));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

function revalidateOrderPaths(trackingCode?: string): void {
  revalidatePath("/admin");
  revalidatePath("/admin/orders");
  revalidatePath("/orders");
  revalidatePath("/account");
  if (trackingCode) revalidatePath(`/orders/${trackingCode}`);
}

function getString(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}
