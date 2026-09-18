import type { SellerCommission } from "./seller-commission";

/**
 * Admin sipariş düzeltmesi (ürün ekle/çıkar, adet değiştir) ve reddedilen
 * siparişlerin listeden silinmesi için saf kurallar. Dosya/kilit işlemleri
 * commercial-repository.ts içindedir; burada yalnız karar ve hesap vardır.
 */

export interface EditableOrderItem {
  id: string;
  sku: string;
  productName: string;
  brand?: string;
  category?: string;
  unit: string;
  quantity: number;
  unitPrice: string;
  lineTotal: string;
  currency: string;
  stockStatus?: string;
  quoteItemId?: string;
}

export interface EditableOrder {
  status: string;
  paymentStatus: string;
  financeApproval: string;
  companyApprovalStatus: string;
  currency: string;
  items: EditableOrderItem[];
  sellerCommission?: SellerCommission;
}

/** quantity 0 satırı siparişten çıkarır. */
export interface OrderItemChange {
  itemId: string;
  quantity: number;
}

/** Fiyatı sunucuda katalogdan hesaplanmış yeni satır. */
export interface PricedOrderAddition {
  sku: string;
  productName: string;
  brand?: string;
  category?: string;
  unit: string;
  quantity: number;
  unitPrice: number;
  currency: string;
  stockStatus?: string;
}

export interface OrderItemEditResult {
  items: EditableOrderItem[];
  total: number;
  changes: string[];
}

export const MAX_ORDER_LINE_QUANTITY = 999_999;
const SHIPPED_STATUSES = new Set(["SHIPPED", "DELIVERED", "COMPLETED"]);

/** Admin listesinde "reddedilen" sayılan sipariş: iptal, finans reddi veya firma içi red. */
export function isOrderRejected(order: Pick<EditableOrder, "status" | "financeApproval" | "companyApprovalStatus">): boolean {
  return (
    order.status === "CANCELLED" ||
    normalizeText(order.financeApproval) === "reddedildi" ||
    order.companyApprovalStatus === "REJECTED"
  );
}

/** Serbest metin ödeme durumunda tahsilatın yapıldığını gösteren ifadeler (seller-commission.ts ile uyumlu). */
export function isOrderPaymentCollected(paymentStatus: string): boolean {
  const normalized = normalizeText(paymentStatus);
  if (!normalized) return false;
  if (normalized === "paid") return true;
  return ["odendi", "tahsil edildi", "odeme alindi"].some((phrase) => normalized.includes(phrase));
}

export function orderItemsEditBlockReason(order: EditableOrder): string | null {
  if (order.status === "CANCELLED") return "İptal edilmiş siparişin ürünleri değiştirilemez.";
  if (SHIPPED_STATUSES.has(order.status)) {
    return "Sevk edilmiş veya teslim edilmiş siparişin ürünleri değiştirilemez; iade ya da yeni sipariş kullanın.";
  }
  if (isOrderPaymentCollected(order.paymentStatus)) {
    return "Tahsilatı yapılmış siparişin ürünleri değiştirilemez; fark için iade veya ek sipariş açın.";
  }
  const commission = order.sellerCommission;
  if (commission && (commission.paidCents !== 0 || commission.lines.some((line) => line.refundedQuantity > 0))) {
    return "Satıcı komisyonu ödenmiş veya iade kaydı olan siparişin ürünleri değiştirilemez.";
  }
  return null;
}

export function orderDeletionBlockReason(order: EditableOrder): string | null {
  if (!isOrderRejected(order)) return "Yalnızca reddedilen veya iptal edilen siparişler silinebilir.";
  if (isOrderPaymentCollected(order.paymentStatus)) {
    return "Tahsilatı yapılmış sipariş silinemez; önce iade kaydını tamamlayın.";
  }
  if (order.sellerCommission && order.sellerCommission.paidCents !== 0) {
    return "Satıcı komisyon ödemesi kayıtlı sipariş silinemez.";
  }
  return null;
}

/**
 * Adet değişikliği, satır çıkarma ve yeni satır eklemeyi uygular.
 * Mevcut satırların birim fiyatı korunur; yeni satırın fiyatı çağıran tarafça
 * katalog + müşteri fiyat motorundan hesaplanmış olmalıdır.
 */
export function applyOrderItemChanges(
  order: Pick<EditableOrder, "currency" | "items">,
  changes: OrderItemChange[],
  additions: PricedOrderAddition[],
  createItemId: () => string
): OrderItemEditResult {
  const changeById = new Map<string, number>();
  for (const change of changes) {
    if (!order.items.some((item) => item.id === change.itemId)) throw new Error("Düzenlenen satır siparişte bulunamadı.");
    changeById.set(change.itemId, validQuantity(change.quantity, true));
  }

  const summary: string[] = [];
  const items: EditableOrderItem[] = [];
  for (const item of order.items) {
    const nextQuantity = changeById.get(item.id) ?? item.quantity;
    if (nextQuantity === 0) {
      summary.push(`${item.sku} çıkarıldı (${item.quantity} ${item.unit})`);
      continue;
    }
    if (nextQuantity !== item.quantity) summary.push(`${item.sku} adet ${item.quantity} → ${nextQuantity}`);
    items.push(nextQuantity === item.quantity ? item : withQuantity(item, nextQuantity));
  }

  for (const addition of additions) {
    const quantity = validQuantity(addition.quantity, false);
    if (!(addition.unitPrice > 0)) throw new Error(`${addition.sku} için geçerli bir satış fiyatı yok.`);
    if (normalizeCurrency(addition.currency) !== normalizeCurrency(order.currency)) {
      throw new Error(`${addition.sku} farklı para biriminde (${addition.currency}); aynı siparişe eklenemez.`);
    }
    const unitPrice = money(addition.unitPrice);
    const existingIndex = items.findIndex((item) => item.sku === addition.sku && item.unitPrice === unitPrice);
    if (existingIndex >= 0) {
      const existing = items[existingIndex]!;
      items[existingIndex] = withQuantity(existing, validQuantity(existing.quantity + quantity, false));
      summary.push(`${addition.sku} +${quantity} ${existing.unit}`);
      continue;
    }
    items.push(stripUndefined({
      id: createItemId(),
      sku: addition.sku,
      productName: addition.productName,
      brand: addition.brand,
      category: addition.category,
      unit: addition.unit,
      quantity,
      unitPrice,
      lineTotal: money(addition.unitPrice * quantity),
      currency: order.currency,
      stockStatus: addition.stockStatus
    }) as EditableOrderItem);
    summary.push(`${addition.sku} eklendi (${quantity} ${addition.unit})`);
  }

  if (items.length === 0) {
    throw new Error("Siparişte en az bir ürün kalmalı. Siparişin tamamını kaldırmak için iptal edin.");
  }

  return {
    items,
    total: roundMoney(items.reduce((sum, item) => sum + parseMoney(item.lineTotal), 0)),
    changes: summary
  };
}

/**
 * Düzenlemeden sonra komisyon satırlarını yeni ürün satırlarıyla yeniden kurar.
 * orderItemsEditBlockReason ödenmiş/iade kayıtlı komisyonları önceden engeller.
 */
export function rebuildCommissionLines(commission: SellerCommission, items: EditableOrderItem[]): SellerCommission {
  return {
    ...commission,
    revision: commission.revision + 1,
    lines: items.map((item) => ({
      itemId: item.id,
      productName: item.productName,
      quantity: item.quantity,
      saleCents: Math.round(parseMoney(item.lineTotal) * 100),
      refundedQuantity: 0
    }))
  };
}

function withQuantity(item: EditableOrderItem, quantity: number): EditableOrderItem {
  return { ...item, quantity, lineTotal: money(parseMoney(item.unitPrice) * quantity) };
}

function validQuantity(value: number, allowZero: boolean): number {
  if (!Number.isInteger(value) || value < (allowZero ? 0 : 1) || value > MAX_ORDER_LINE_QUANTITY) {
    throw new Error(`Adet ${allowZero ? 0 : 1} ile ${MAX_ORDER_LINE_QUANTITY.toLocaleString("tr-TR")} arasında tam sayı olmalıdır.`);
  }
  return value;
}

function normalizeCurrency(value: string): string {
  const upper = value.trim().toUpperCase();
  return upper === "TL" || upper === "" ? "TRY" : upper;
}

function normalizeText(value: string): string {
  return (value ?? "")
    .trim()
    .toLocaleLowerCase("tr-TR")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/ı/g, "i")
    .replace(/\s+/g, " ");
}

function parseMoney(value: string): number {
  const raw = (value ?? "").trim().replace(/\s/g, "");
  const cleaned = raw.includes(",") ? raw.replace(/\./g, "").replace(",", ".") : raw;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function money(value: number): string {
  return roundMoney(value).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: false });
}

function stripUndefined<T extends object>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined)) as T;
}
