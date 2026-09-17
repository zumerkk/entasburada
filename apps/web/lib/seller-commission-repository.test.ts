import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
vi.mock("server-only", () => ({}));
vi.mock("./catalog-repository", () => ({ loadCatalogStore: vi.fn() }));
vi.mock("./notification-repository", () => ({ createNotification: vi.fn() }));
vi.mock("./customer-auth", () => ({ canApproveCompanyOrders: vi.fn(), getCompanyMembers: vi.fn(), findCustomerByEmail: async () => ({ referral: { sellerId: "eren", sellerName: "Eren", code: "ENT-EREN", linkedAt: "2026-09-16", source: "code" } }) }));
let dir: string;
let repo: typeof import("./commercial-repository");
const previousDir = process.env.ENTAS_COMMERCIAL_DATA_DIR;
beforeAll(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "entas-commission-test-"));
  process.env.ENTAS_COMMERCIAL_DATA_DIR = dir;
  repo = await import("./commercial-repository");
  await writeFile(path.join(dir,"quotes.json"), JSON.stringify([{ id:"quote", quoteNo:"T001", status:"APPROVED", companyName:"Test Customer", dealerName:"Buyer", email:"buyer@example.test", phone:"05320000000", currency:"TRY", items:[{ id:"item", sku:"SKU", productName:"Test product", unit:"adet", quantity:2, quotedUnitPrice:"1000.00", currency:"TRY" }], history:[] }]));
  await writeFile(path.join(dir,"orders.json"),"[]");
});
afterAll(async () => {
  if (previousDir === undefined) delete process.env.ENTAS_COMMERCIAL_DATA_DIR; else process.env.ENTAS_COMMERCIAL_DATA_DIR = previousDir;
  await rm(dir,{ recursive:true, force:true });
});
describe("persisted referral order lifecycle", () => {
  it("snapshots referral and lines, serializes settlements, handles returns after payment", async () => {
    const order = await repo.convertQuoteToOrder("quote","Admin");
    expect(order.sellerCommission?.referral.sellerId).toBe("eren");
    expect(order.sellerCommission?.lines[0]?.saleCents).toBe(200000);
    expect((await repo.convertQuoteToOrder("quote","Admin")).id).toBe(order.id);
    await repo.updateOrderOperation({ orderId:order.id, status:"COMPLETED", paymentStatus:"Ödendi" },"Admin");
    const input = { orderId:order.id, revision:0, operation:"settle" as const, itemId:"", quantity:0, reference:"BANK-001" };
    const results = await Promise.allSettled([repo.updateSellerCommission(input,"Admin"),repo.updateSellerCommission(input,"Admin")]);
    expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
    const saved = await repo.getAdminOrderById(order.id);
    expect(saved?.sellerCommission?.paidCents).toBe(20000);
    expect(saved?.sellerCommission?.payments).toHaveLength(1);
    const lineId=order.sellerCommission!.lines[0]!.itemId;
    await expect(repo.updateSellerCommission({ ...input,revision:1,operation:"refund",itemId:lineId,quantity:3 },"Admin")).rejects.toThrow();
    await repo.updateSellerCommission({ ...input,revision:1,operation:"refund",itemId:lineId,quantity:1,reference:"RETURN-001" },"Admin");
    await repo.updateSellerCommission({ ...input,revision:2,operation:"recover",reference:"RECOVERY-001" },"Admin");
    const final=await repo.getAdminOrderById(order.id);
    expect(final?.sellerCommission?.paidCents).toBe(10000);
    expect(final?.sellerCommission?.payments[1]?.amountCents).toBe(-10000);
    expect(JSON.parse(await readFile(path.join(dir,"orders.json"),"utf8"))).toHaveLength(1);
  });
});
