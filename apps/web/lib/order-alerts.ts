import "server-only";
import { normalizeWhatsAppNumber, sendWhatsAppTemplate, type WhatsAppSendResult } from "./whatsapp";

// Siparis dustugunde operasyon ekibine WhatsApp bildirimi gonderir.
// Alicilar ORDER_ALERT_WHATSAPP ile degistirilebilir; tanimsizsa asagidaki
// varsayilan numaralara gider.
const DEFAULT_ORDER_ALERT_NUMBERS = ["+90 541 381 21 14", "+90 540 123 71 71"];

/** commercial-repository ile dongusel bagimlilik olmasin diye yapisal tip. */
export interface OrderAlertInput {
  id: string;
  orderNo: string;
  companyName: string;
  dealerUser: string;
  phone: string;
  totalAmount: string;
  currency: string;
  source: string;
  deliveryAddress: string;
  items: Array<{ quantity: number }>;
}

/** Ayni siparis icin tekrar tetiklenirse ikinci mesaji atmayiz. */
const alertedOrderIds = new Set<string>();
const ALERTED_CACHE_LIMIT = 500;

export function orderAlertRecipients(): string[] {
  const raw = process.env.ORDER_ALERT_WHATSAPP?.trim();
  const source = raw ? raw.split(/[,;\r\n]+/) : DEFAULT_ORDER_ALERT_NUMBERS;
  const seen = new Set<string>();
  for (const entry of source) {
    const normalized = normalizeWhatsAppNumber(entry);
    if (normalized) seen.add(normalized);
  }
  return [...seen];
}

export function buildOrderAlertParams(order: OrderAlertInput): string[] {
  return [
    order.orderNo,
    order.companyName || "Bilinmeyen firma",
    `${formatAmount(order.totalAmount)} ${order.currency || "TRY"}`,
    `${totalQuantity(order)} adet / ${order.items.length} kalem`,
    [order.dealerUser, order.phone].filter(Boolean).join(" · ") || "-"
  ];
}

export function buildOrderAlertText(order: OrderAlertInput): string {
  return [
    `🛒 YENİ SİPARİŞ — ${order.orderNo}`,
    `Firma: ${order.companyName || "Bilinmeyen firma"}`,
    `Yetkili: ${[order.dealerUser, order.phone].filter(Boolean).join(" · ") || "-"}`,
    `Tutar: ${formatAmount(order.totalAmount)} ${order.currency || "TRY"}`,
    `Kalem: ${totalQuantity(order)} adet / ${order.items.length} satır`,
    `Kanal: ${order.source || "-"}`,
    `Teslim: ${order.deliveryAddress || "-"}`,
    `Panel: ${adminOrderUrl(order.id)}`
  ].join("\n");
}

export async function sendNewOrderAlert(order: OrderAlertInput): Promise<WhatsAppSendResult[]> {
  const recipients = orderAlertRecipients();
  if (recipients.length === 0) {
    return [];
  }

  const template = process.env.WHATSAPP_TEMPLATE_NEW_ORDER?.trim() || "yeni_siparis";
  const params = buildOrderAlertParams(order);
  const fallbackText = buildOrderAlertText(order);

  return Promise.all(
    recipients.map((to) =>
      sendWhatsAppTemplate({
        to,
        template,
        params,
        urlButtonParam: order.id,
        fallbackText
      })
    )
  );
}

/**
 * Bildirimi siparis akisindan ayirir: gonderim hatasi siparisi dusurmemelidir.
 */
export function queueNewOrderAlert(order: OrderAlertInput): void {
  if (alertedOrderIds.has(order.id)) {
    return;
  }
  if (alertedOrderIds.size >= ALERTED_CACHE_LIMIT) {
    alertedOrderIds.clear();
  }
  alertedOrderIds.add(order.id);

  void sendNewOrderAlert(order)
    .then((results) => {
      for (const result of results) {
        if (result.ok) {
          console.info(`[order-alert] ${order.orderNo} → ${result.to} (${result.provider}) gonderildi.`);
        } else if (result.error !== "WhatsApp saglayicisi tanimli degil.") {
          console.warn(`[order-alert] ${order.orderNo} → ${result.to} gonderilemedi: ${result.error}`);
        }
      }
    })
    .catch((error: unknown) => {
      console.warn(`[order-alert] ${order.orderNo} bildirim hatasi: ${error instanceof Error ? error.message : error}`);
    });
}

function totalQuantity(order: OrderAlertInput): number {
  return order.items.reduce((sum, item) => sum + (Number.isFinite(item.quantity) ? item.quantity : 0), 0);
}

/** commercial-repository "12500.00" uretir; mesajda "12.500,00" gosteriyoruz. */
function formatAmount(value: string): string {
  const parsed = Number(String(value).replace(/\s/g, "").replace(",", "."));
  if (!Number.isFinite(parsed)) return value;
  return parsed.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function adminOrderUrl(orderId: string): string {
  const base = (process.env.NEXT_PUBLIC_SITE_URL?.trim() || "https://entasburada.com").replace(/\/+$/, "");
  return `${base}/admin/orders/${orderId}`;
}
