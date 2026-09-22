import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const memory = vi.hoisted(() => ({ customers: [] as unknown[] }));
vi.mock("node:fs", () => ({ existsSync: () => true }));
vi.mock("node:fs/promises", () => ({ mkdir: vi.fn(), readFile: async () => JSON.stringify(memory.customers), rename: vi.fn(), writeFile: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("./dealer-application-repository", () => ({ clearApplicationTemporaryPasswordForAccount: vi.fn() }));
import { resolveSellerReferral, sellerReferenceCode } from "./customer-auth";
const seller = { id: "seller-eren", email: "eren@example.test", authorizedPerson: "Eren", status: "approved", sellerAccess: { enabled: true } };
beforeEach(() => { memory.customers = [{ ...seller }]; });
describe("seller referral attribution", () => {
  it("resolves active seller with normalized code, stable across name changes", async () => {
    const code = sellerReferenceCode(seller);
    expect(sellerReferenceCode({ id: seller.id })).toBe(code);
    expect(await resolveSellerReferral(` ${code.toLowerCase()} `, "new@example.test")).toMatchObject({ sellerId: seller.id, sellerName: "Eren", source: "code" });
  });
  it("allows registration without a referral", async () => { expect(await resolveSellerReferral("", "new@example.test")).toBeUndefined(); });
  it("rejects invalid and suspended sellers", async () => {
    await expect(resolveSellerReferral("unknown", "new@example.test")).rejects.toThrow();
    memory.customers = [{ ...seller, status: "suspended" }];
    await expect(resolveSellerReferral(sellerReferenceCode(seller), "new@example.test")).rejects.toThrow();
  });
  it("rejects self referral and reassignment of existing customers", async () => {
    await expect(resolveSellerReferral(sellerReferenceCode(seller), seller.email)).rejects.toThrow();
    memory.customers.push({ id: "customer", email: "existing@example.test" });
    await expect(resolveSellerReferral(sellerReferenceCode(seller), "EXISTING@example.test")).rejects.toThrow();
  });
  it("does not accept a company member as an independent seller", async () => {
    memory.customers = [{ ...seller, companyId: "other-owner" }];
    await expect(resolveSellerReferral(sellerReferenceCode(seller), "new@example.test")).rejects.toThrow();
  });
});

const liveErenId = "cust-c9dcde02-88f2-4b70-ba64-d6ad614e498b";
it("uses Eren's short code and accepts the previously shared long code", async () => {
  memory.customers = [{ ...seller, id: liveErenId }];
  expect(sellerReferenceCode({ id: liveErenId })).toBe("ERN-ENT");
  for (const code of ["ERN-ENT", " ern-ent ", "ENT-DAD4E744523A7BB5443C"]) {
    expect(await resolveSellerReferral(code, "new@example.test")).toMatchObject({ sellerId: liveErenId, code: "ERN-ENT" });
  }
  expect(sellerReferenceCode(seller)).not.toBe("ERN-ENT");
});
it("rejects both Eren aliases if the account is inactive", async () => {
  memory.customers = [{ ...seller, id: liveErenId, status: "suspended" }];
  for (const code of ["ERN-ENT", "ENT-DAD4E744523A7BB5443C"]) await expect(resolveSellerReferral(code, "new@example.test")).rejects.toThrow();
});
