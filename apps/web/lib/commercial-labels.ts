import type { OrderStatus, QuoteStatus } from "./commercial-repository";

/**
 * Siparis ve teklif durumlarinin Turkce karsiliklari.
 *
 * Enum degerleri depolama bicimidir; ekranda ham haliyle gosterilirse ne musteri
 * ne de admin ne anlama geldigini anlar. Ayrica "FINANCE_APPROVAL_PENDING" gibi
 * uzun degerler tablo sutununu tasirip yandaki sutunun uzerine biniyordu.
 *
 * Renk tonu da burada tutulur: her render noktasinin kendi ton mantigini
 * yeniden turetmesi tutarsizliga yol aciyordu.
 */
export type StatusTone = "success" | "warning" | "danger" | "info" | "neutral";

export interface StatusLabel {
  label: string;
  tone: StatusTone;
  /** Musteriye gosterilen kisa aciklama; rozetin yaninda veya title olarak kullanilir. */
  hint: string;
}

const ORDER_STATUS: Record<OrderStatus, StatusLabel> = {
  DRAFT: { label: "Taslak", tone: "neutral", hint: "Sipariş henüz tamamlanmadı." },
  PAYMENT_PENDING: { label: "Ödeme bekliyor", tone: "warning", hint: "Kart ödemesi tamamlanmayı bekliyor." },
  APPROVAL_PENDING: { label: "Onay bekliyor", tone: "warning", hint: "Sipariş ekip onayına düştü." },
  FINANCE_APPROVAL_PENDING: { label: "Finans onayı bekliyor", tone: "warning", hint: "Cari hesap limiti ve ödeme koşulu inceleniyor." },
  STOCK_WAITING: { label: "Stok bekliyor", tone: "warning", hint: "Ürünlerin tedariki bekleniyor." },
  PREPARING: { label: "Hazırlanıyor", tone: "info", hint: "Sipariş depoda hazırlanıyor." },
  READY_TO_SHIP: { label: "Sevkiyata hazır", tone: "info", hint: "Paket hazır, kargoya verilmeyi bekliyor." },
  SHIPPED: { label: "Kargoya verildi", tone: "info", hint: "Sipariş yola çıktı." },
  DELIVERED: { label: "Teslim edildi", tone: "success", hint: "Sipariş alıcıya ulaştı." },
  COMPLETED: { label: "Tamamlandı", tone: "success", hint: "Sipariş kapatıldı." },
  CANCELLED: { label: "İptal edildi", tone: "danger", hint: "Sipariş iptal edildi." }
};

const QUOTE_STATUS: Record<QuoteStatus, StatusLabel> = {
  DRAFT: { label: "Taslak", tone: "neutral", hint: "Teklif henüz gönderilmedi." },
  SUBMITTED: { label: "İletildi", tone: "info", hint: "Teklif talebi bize ulaştı." },
  ASSIGNED: { label: "İnceleniyor", tone: "info", hint: "Teklif bir satış temsilcisine atandı." },
  PRICED: { label: "Fiyatlandırıldı", tone: "warning", hint: "Teklif hazır, onayınızı bekliyor." },
  APPROVED: { label: "Onaylandı", tone: "success", hint: "Teklif kabul edildi." },
  REJECTED: { label: "Reddedildi", tone: "danger", hint: "Teklif kabul edilmedi." },
  EXPIRED: { label: "Süresi doldu", tone: "neutral", hint: "Teklifin geçerlilik süresi doldu." },
  CONVERTED: { label: "Siparişe dönüştü", tone: "success", hint: "Teklif üzerinden sipariş oluşturuldu." }
};

/** Bilinmeyen bir deger gelirse ham hali gosterilir; sessizce bos kalmasindan iyidir. */
function fallback(value: string): StatusLabel {
  return { label: value, tone: "neutral", hint: "" };
}

export function orderStatusLabel(status: string): StatusLabel {
  return ORDER_STATUS[status as OrderStatus] ?? fallback(status);
}

export function quoteStatusLabel(status: string): StatusLabel {
  return QUOTE_STATUS[status as QuoteStatus] ?? fallback(status);
}

/** Admin durum secim kutusu icin sirali liste. */
export const ORDER_STATUS_OPTIONS: Array<{ value: OrderStatus; label: string }> = (
  Object.keys(ORDER_STATUS) as OrderStatus[]
).map((value) => ({ value, label: ORDER_STATUS[value].label }));

export const QUOTE_STATUS_OPTIONS: Array<{ value: QuoteStatus; label: string }> = (
  Object.keys(QUOTE_STATUS) as QuoteStatus[]
).map((value) => ({ value, label: QUOTE_STATUS[value].label }));
