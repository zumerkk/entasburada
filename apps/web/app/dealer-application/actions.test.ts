import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const mocks=vi.hoisted(() => ({ current:vi.fn(), resolve:vi.fn(), create:vi.fn() }));
vi.mock("../../lib/customer-auth", () => ({ getCurrentCustomer:mocks.current, resolveSellerReferral:mocks.resolve, sellerReferenceCode: () => "ENT-SERVER-CODE" }));
vi.mock("../../lib/dealer-application-repository", () => ({ createDealerApplication:mocks.create }));
vi.mock("../../lib/rate-limit", () => ({ consumeRateLimit:async () => ({allowed:true}) }));
vi.mock("../../lib/security", () => ({ getClientAddress: () => "127.0.0.1" }));
vi.mock("next/headers", () => ({ headers:async () => ({}) }));
vi.mock("next/navigation", () => ({ redirect:(url:string) => {throw new Error(`REDIRECT:${url}`);} }));
import { submitDealerApplicationAction } from "./actions";
function form() {
  const data=new FormData();
  Object.entries({ companyTitle:"Test Bayi",taxOffice:"Merkez",taxNumber:"1234567890",companyType:"dealer",authorizedPerson:"Test Müşteri",phone:"05320000000",email:"buyer@example.test",invoiceAddress:"Test fatura adresi",deliveryAddress:"Test teslimat adresi",city:"İstanbul",district:"Kadıköy",activityArea:"Hırdavat",dealershipType:"standard",kvkkAccepted:"on" }).forEach(([k,v]) => data.set(k,v));
  return data;
}
beforeEach(() => {vi.clearAllMocks();mocks.current.mockResolvedValue(null);mocks.resolve.mockResolvedValue(undefined);mocks.create.mockResolvedValue({reference:"BSV-TEST"});});
describe("referral registration actions", () => {
  it("allows ordinary registration without a referral", async () => {
    await expect(submitDealerApplicationAction(form())).rejects.toThrow("REDIRECT:/dealer-application?submitted=BSV-TEST");
    expect(mocks.create).toHaveBeenCalledWith(expect.not.objectContaining({referral:expect.anything()}));
  });
  it("derives panel referral server-side, ignores a forged submitted code", async () => {
    mocks.current.mockResolvedValue({id:"eren",sellerAccess:{enabled:true}});
    const referral={sellerId:"eren",sellerName:"Eren",code:"ENT-SERVER-CODE",source:"seller",linkedAt:"now"}; mocks.resolve.mockResolvedValue(referral);
    const data=form();data.set("sellerEntry","1");data.set("referralCode","FORGED");
    await expect(submitDealerApplicationAction(data)).rejects.toThrow("REDIRECT:/satici?submitted=BSV-TEST");
    expect(mocks.resolve).toHaveBeenCalledWith("ENT-SERVER-CODE","buyer@example.test","seller");
    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({referral}));
  });
  it("rejects unauthenticated seller entry", async () => {
    const data=form();data.set("sellerEntry","1");expect((await submitDealerApplicationAction(data)).error).toContain("oturumunuz");expect(mocks.create).not.toHaveBeenCalled();
  });
  it("returns invalid-reference and duplicate errors without navigating away", async () => {
    mocks.resolve.mockRejectedValue(new Error("Referans geçersiz"));expect(await submitDealerApplicationAction(form())).toEqual({error:"Referans geçersiz"});expect(mocks.create).not.toHaveBeenCalled();
    mocks.resolve.mockResolvedValue(undefined);mocks.create.mockRejectedValue(new Error("Başvuru zaten var"));expect(await submitDealerApplicationAction(form())).toEqual({error:"Başvuru zaten var"});
  });
  it("does not create an application without consent", async () => {
    const data=form();data.delete("kvkkAccepted");expect((await submitDealerApplicationAction(data)).error).toContain("KVKK");expect(mocks.create).not.toHaveBeenCalled();
  });
});
