import { describe, expect, it } from "vitest";
import { ORDER_STATUS_OPTIONS, QUOTE_STATUS_OPTIONS, orderStatusLabel, quoteStatusLabel } from "./commercial-labels";
import type { OrderStatus, QuoteStatus } from "./commercial-repository";

// Depoda tanimli tum durumlar. Yeni bir durum eklenip sozluge yazilmazsa bu
// liste ile sozluk arasindaki fark testi dusurur; ekranda ham enum gorunmez.
const ORDER_STATUSES: OrderStatus[] = [
  "DRAFT",
  "PAYMENT_PENDING",
  "APPROVAL_PENDING",
  "FINANCE_APPROVAL_PENDING",
  "STOCK_WAITING",
  "PREPARING",
  "READY_TO_SHIP",
  "SHIPPED",
  "DELIVERED",
  "CANCELLED",
  "COMPLETED"
];

const QUOTE_STATUSES: QuoteStatus[] = [
  "DRAFT",
  "SUBMITTED",
  "ASSIGNED",
  "PRICED",
  "APPROVED",
  "REJECTED",
  "EXPIRED",
  "CONVERTED"
];

describe("ticari durum etiketleri", () => {
  it("her sipariş durumu için Türkçe etiket ve açıklama verir", () => {
    for (const status of ORDER_STATUSES) {
      const entry = orderStatusLabel(status);
      expect(entry.label, status).not.toBe(status);
      expect(entry.label.length, status).toBeGreaterThan(2);
      expect(entry.hint.length, status).toBeGreaterThan(5);
      // Ham enum bicimi (BUYUK_HARF_ALTCIZGI) etikete sizmamali.
      expect(/^[A-Z_]+$/.test(entry.label), status).toBe(false);
    }
  });

  it("her teklif durumu için Türkçe etiket verir", () => {
    for (const status of QUOTE_STATUSES) {
      const entry = quoteStatusLabel(status);
      expect(entry.label, status).not.toBe(status);
      expect(/^[A-Z_]+$/.test(entry.label), status).toBe(false);
    }
  });

  it("seçim listeleri tüm durumları kapsar", () => {
    expect(ORDER_STATUS_OPTIONS.map((option) => option.value).sort()).toEqual([...ORDER_STATUSES].sort());
    expect(QUOTE_STATUS_OPTIONS.map((option) => option.value).sort()).toEqual([...QUOTE_STATUSES].sort());
  });

  it("bilinmeyen bir durumda boş bırakmaz, ham değeri gösterir", () => {
    expect(orderStatusLabel("SOME_NEW_STATUS").label).toBe("SOME_NEW_STATUS");
    expect(orderStatusLabel("SOME_NEW_STATUS").tone).toBe("neutral");
  });

  it("iptal ve red durumlarını tehlike tonuyla işaretler", () => {
    expect(orderStatusLabel("CANCELLED").tone).toBe("danger");
    expect(quoteStatusLabel("REJECTED").tone).toBe("danger");
    expect(orderStatusLabel("DELIVERED").tone).toBe("success");
    expect(orderStatusLabel("FINANCE_APPROVAL_PENDING").tone).toBe("warning");
  });
});
