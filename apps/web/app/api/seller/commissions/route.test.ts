import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({ current:vi.fn(), dashboard:vi.fn() }));
vi.mock("../../../../lib/customer-auth", () => ({getCurrentCustomer:mocks.current}));
vi.mock("../../../../lib/seller-dashboard", () => ({sellerDashboard:mocks.dashboard}));
import { GET } from "./route";
describe("seller CSV access", () => {
  it("denies anonymous, ordinary customers and company employees", async () => {
    for (const customer of [null,{id:"buyer"},{id:"employee",companyId:"owner",sellerAccess:{enabled:true}}]) {
      mocks.current.mockResolvedValue(customer); expect((await GET()).status).toBe(403);
    }
  });
  it("uses session seller identity and escapes spreadsheet formulas", async () => {
    mocks.current.mockResolvedValue({id:"eren",sellerAccess:{enabled:true}});
    mocks.dashboard.mockResolvedValue({orders:[{orderNo:"S001",companyName:"=DANGER()",orderedAt:"2026-09-16",currency:"TRY",status:"COMPLETED",paymentStatus:"PAID",sellerCommission:{paidCents:0,lines:[{itemId:"1",productName:"Product",quantity:1,refundedQuantity:0,saleCents:10000}]}}]});
    const response=await GET(); const csv=await response.text();
    expect(mocks.dashboard).toHaveBeenCalledWith("eren");
    expect(csv).toContain("'=DANGER()"); expect(csv).toContain('"10.00"');
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  });
});
