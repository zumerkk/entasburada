import { describe, expect, it } from "vitest";
import { commissionSummary, settleCommission, type SellerCommission } from "./seller-commission";
const fixture = (): SellerCommission => ({ referral: { sellerId: "eren", sellerName: "Eren", code: "ENT-123", linkedAt: "2026-09-16", source: "code" }, rate: 10, lines: [{ itemId: "1", productName: "Musluk", quantity: 3, refundedQuantity: 0, saleCents: 10001 }, { itemId: "2", productName: "Boru", quantity: 2, refundedQuantity: 0, saleCents: 20000 }], paidCents: 0, revision: 0, payments: [] });
describe("seller commissions", () => {
  it.each(["ÖDENDİ", "TAHSİL EDİLDİ", "  Ödeme   alındı  "])("recognizes Turkish case and whitespace in %s", (payment) => {
    expect(commissionSummary(fixture(), "COMPLETED", payment).payableCents).toBe(3000);
  });
  it("does not count an already paid commission as pending when delivery is corrected", () => {
    const paid=settleCommission(fixture(),"COMPLETED","PAID","BANK-001","admin","now");
    expect(commissionSummary(paid,"SHIPPED","PAID").pendingCents).toBe(0);
  });

  it("rounds each product line in cents and excludes unrelated shipping totals", () => {
    expect(commissionSummary(fixture(), "COMPLETED", "Ödendi").earnedCents).toBe(3000);
  });
  it("requires both delivery and payment", () => {
    expect(commissionSummary(fixture(), "SHIPPED", "Ödendi").payableCents).toBe(0);
    expect(commissionSummary(fixture(), "COMPLETED", "Ödenmedi").pendingCents).toBe(3000);
    expect(commissionSummary(fixture(), "DELIVERED", "Kartla ödendi (ZiraatPay)").payableCents).toBe(3000);
  });
  it("deducts partial product returns", () => {
    const c=fixture(); c.lines[0]!.refundedQuantity=1;
    expect(commissionSummary(c,"COMPLETED","PAID").earnedCents).toBe(2667);
  });
  it("does not settle the same amount twice and preserves the audit", () => {
    const paid=settleCommission(fixture(),"COMPLETED","PAID","BANK-001","admin","2026-09-16");
    expect(paid.paidCents).toBe(3000); expect(paid.revision).toBe(1); expect(paid.payments[0]?.reference).toBe("BANK-001");
    expect(() => settleCommission(paid,"COMPLETED","PAID","BANK-002","admin","2026-09-16")).toThrow();
  });
  it("keeps historical payments and reports recovery on cancelled sales", () => {
    const paid=settleCommission(fixture(),"COMPLETED","PAID","BANK-001","admin","2026-09-16");
    expect(commissionSummary(paid,"CANCELLED","PAID")).toMatchObject({ earnedCents:0, recoveryCents:3000, paidCents:3000, payableCents:0 });
  });
  it("does not create pending earnings for fully refunded payments", () => {
    expect(commissionSummary(fixture(),"COMPLETED","REFUNDED")).toMatchObject({ earnedCents:0, pendingCents:0, payableCents:0 });
  });
  it("requires payment reference and rejects pending settlements", () => {
    expect(() => settleCommission(fixture(),"COMPLETED","PAID","","admin","now")).toThrow();
    expect(() => settleCommission(fixture(),"SHIPPED","PAID","BANK-001","admin","now")).toThrow();
  });
});
