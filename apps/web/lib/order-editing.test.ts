import { describe, expect, it } from "vitest";
import {
  applyOrderItemChanges,
  isOrderPaymentCollected,
  isOrderRejected,
  orderDeletionBlockReason,
  orderItemsEditBlockReason,
  rebuildCommissionLines,
  type EditableOrder
} from "./order-editing";

function order(overrides: Partial<EditableOrder> = {}): EditableOrder {
  return {
    status: "FINANCE_APPROVAL_PENDING",
    paymentStatus: "Cari hesap",
    financeApproval: "Bekliyor",
    companyApprovalStatus: "NOT_REQUIRED",
    currency: "TRY",
    items: [
      { id: "a", sku: "BK-101", productName: "Gelberi", unit: "ADET", quantity: 5, unitPrice: "87.60", lineTotal: "438.00", currency: "TRY" },
      { id: "b", sku: "BK-313", productName: "Çapa", unit: "ADET", quantity: 2, unitPrice: "156.00", lineTotal: "312.00", currency: "TRY" }
    ],
    ...overrides
  };
}

let nextId = 0;
const createId = () => `new-${++nextId}`;

describe("order editing", () => {
  it("changes quantities, removes lines and adds priced products", () => {
    const result = applyOrderItemChanges(
      order(),
      [{ itemId: "a", quantity: 10 }, { itemId: "b", quantity: 0 }],
      [{ sku: "BK-703", productName: "Kazma", unit: "ADET", quantity: 3, unitPrice: 648, currency: "TL" }],
      createId
    );

    expect(result.items.map((item) => [item.sku, item.quantity, item.lineTotal])).toEqual([
      ["BK-101", 10, "876.00"],
      ["BK-703", 3, "1944.00"]
    ]);
    expect(result.total).toBe(2820);
    expect(result.changes).toEqual(["BK-101 adet 5 → 10", "BK-313 çıkarıldı (2 ADET)", "BK-703 eklendi (3 ADET)"]);
  });

  it("merges an added product into the same-priced existing line", () => {
    const result = applyOrderItemChanges(order(), [], [{ sku: "BK-101", productName: "Gelberi", unit: "ADET", quantity: 1, unitPrice: 87.6, currency: "TRY" }], createId);

    expect(result.items).toHaveLength(2);
    expect(result.items[0]).toMatchObject({ id: "a", quantity: 6, lineTotal: "525.60" });
  });

  it("rejects empty orders, invalid quantities, unpriced and foreign-currency products", () => {
    expect(() => applyOrderItemChanges(order(), [{ itemId: "a", quantity: 0 }, { itemId: "b", quantity: 0 }], [], createId)).toThrow("en az bir ürün");
    expect(() => applyOrderItemChanges(order(), [{ itemId: "a", quantity: 1.5 }], [], createId)).toThrow("tam sayı");
    expect(() => applyOrderItemChanges(order(), [{ itemId: "x", quantity: 1 }], [], createId)).toThrow("bulunamadı");
    expect(() => applyOrderItemChanges(order(), [], [{ sku: "Z", productName: "Z", unit: "ADET", quantity: 1, unitPrice: 0, currency: "TRY" }], createId)).toThrow("satış fiyatı");
    expect(() => applyOrderItemChanges(order(), [], [{ sku: "Z", productName: "Z", unit: "ADET", quantity: 1, unitPrice: 10, currency: "USD" }], createId)).toThrow("para biriminde");
  });

  it("locks shipped, cancelled, collected and commission-settled orders", () => {
    expect(orderItemsEditBlockReason(order())).toBeNull();
    expect(orderItemsEditBlockReason(order({ status: "SHIPPED" }))).toContain("Sevk");
    expect(orderItemsEditBlockReason(order({ status: "CANCELLED" }))).toContain("İptal");
    expect(orderItemsEditBlockReason(order({ paymentStatus: "Kartla ödendi (ZiraatPay)" }))).toContain("Tahsilat");
    const commission = { referral: { sellerId: "s", sellerName: "Eren", code: "ENT-X", linkedAt: "2026-09-01", source: "code" as const }, rate: 10 as const, lines: [], paidCents: 500, revision: 1, payments: [] };
    expect(orderItemsEditBlockReason(order({ sellerCommission: commission }))).toContain("komisyon");
  });

  it("recognises collected payment wording without matching unpaid wording", () => {
    expect(isOrderPaymentCollected("ÖDENDİ")).toBe(true);
    expect(isOrderPaymentCollected("Ödeme alındı")).toBe(true);
    expect(isOrderPaymentCollected("PAID")).toBe(true);
    expect(isOrderPaymentCollected("Ödenmedi")).toBe(false);
    expect(isOrderPaymentCollected("Kart ödemesi bekleniyor")).toBe(false);
    expect(isOrderPaymentCollected("Cari hesap")).toBe(false);
  });

  it("only allows deleting rejected orders without money movement", () => {
    expect(isOrderRejected(order({ financeApproval: "Reddedildi" }))).toBe(true);
    expect(isOrderRejected(order({ companyApprovalStatus: "REJECTED" }))).toBe(true);
    expect(isOrderRejected(order({ status: "CANCELLED" }))).toBe(true);
    expect(isOrderRejected(order())).toBe(false);

    expect(orderDeletionBlockReason(order())).toContain("Yalnızca reddedilen");
    expect(orderDeletionBlockReason(order({ status: "CANCELLED" }))).toBeNull();
    expect(orderDeletionBlockReason(order({ status: "CANCELLED", paymentStatus: "Ödendi" }))).toContain("Tahsilat");
  });

  it("rebuilds seller commission lines from edited items", () => {
    const commission = { referral: { sellerId: "s", sellerName: "Eren", code: "ENT-X", linkedAt: "2026-09-01", source: "code" as const }, rate: 10 as const, lines: [], paidCents: 0, revision: 2, payments: [] };
    const rebuilt = rebuildCommissionLines(commission, order().items);

    expect(rebuilt.revision).toBe(3);
    expect(rebuilt.lines).toEqual([
      { itemId: "a", productName: "Gelberi", quantity: 5, saleCents: 43800, refundedQuantity: 0 },
      { itemId: "b", productName: "Çapa", quantity: 2, saleCents: 31200, refundedQuantity: 0 }
    ]);
  });
});
