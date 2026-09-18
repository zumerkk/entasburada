import { describe, expect, it } from "vitest";
import type { CommercialHistoryEntry } from "./commercial-repository";
import { PUBLIC_ACTOR_NAME, customerOrderHistory, publicActorName } from "./order-history-view";

function entry(overrides: Partial<CommercialHistoryEntry>): CommercialHistoryEntry {
  return { id: "h", at: "2026-09-18T10:00:00.000Z", actor: "admin", actorName: "admin@entasburada.com", message: "", ...overrides };
}

describe("customer order history", () => {
  it("never shows legacy internal notes or payment references written by admin/system updates", () => {
    const lines = customerOrderHistory([
      entry({ id: "legacy-note", message: "Müşteri ödemeyi geciktiriyor, sevk etme", fromStatus: "PREPARING", toStatus: "PREPARING" }),
      entry({ id: "ziraat", actorName: "ZiraatPay", message: "ZiraatPay 3D ödemesi onaylandı. İşlem ref: abc123", fromStatus: "PAYMENT_PENDING", toStatus: "APPROVAL_PENDING" })
    ]);

    expect(lines.map((line) => line.message)).toEqual(["Sipariş bilgileri güncellendi.", "Sipariş durumu güncellendi: Onay bekliyor."]);
    expect(lines.every((line) => line.actorName === PUBLIC_ACTOR_NAME)).toBe(true);
    expect(JSON.stringify(lines)).not.toContain("abc123");
    expect(JSON.stringify(lines)).not.toContain("admin@entasburada.com");
  });

  it("hides internal entries and keeps public and customer messages verbatim", () => {
    const lines = customerOrderHistory([
      entry({ id: "commission", visibility: "internal", message: "Satıcı komisyonu settle: DEKONT-1" }),
      entry({ id: "edit", visibility: "public", message: "Sipariş ürünleri düzeltildi: BK-101 adet 5 → 8." }),
      entry({ id: "customer", actor: "customer", actorName: "Ali Kaya", message: "Firma siparişi onaylandı." }),
      entry({ id: "note", message: "Sipariş operasyon bilgileri güncellendi.", internalNote: "Gizli not" })
    ]);

    expect(lines.map((line) => [line.id, line.message, line.actorName])).toEqual([
      ["edit", "Sipariş ürünleri düzeltildi: BK-101 adet 5 → 8.", PUBLIC_ACTOR_NAME],
      ["customer", "Firma siparişi onaylandı.", "Ali Kaya"],
      ["note", "Sipariş bilgileri güncellendi.", PUBLIC_ACTOR_NAME]
    ]);
    expect(JSON.stringify(lines)).not.toContain("Gizli not");
  });

  it("masks non-customer actor names", () => {
    expect(publicActorName({ actor: "admin", actorName: "admin@entasburada.com" })).toBe(PUBLIC_ACTOR_NAME);
    expect(publicActorName({ actor: "system", actorName: "ZiraatPay" })).toBe(PUBLIC_ACTOR_NAME);
    expect(publicActorName({ actor: "customer", actorName: "Ali Kaya" })).toBe("Ali Kaya");
  });
});
