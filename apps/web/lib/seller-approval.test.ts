import { hashPassword } from "./password-hash";
import { beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const m = vi.hoisted(() => ({ seller:vi.fn(), application:vi.fn(), existing:vi.fn(), customers:vi.fn(), provision:vi.fn(), record:vi.fn(), update:vi.fn(), password:vi.fn() }));
vi.mock("./seller-dashboard", () => ({ requireReferralSeller:m.seller }));
vi.mock("./customer-auth", () => ({ findCustomerByEmail:m.existing,getCustomers:m.customers }));
vi.mock("./dealer-provisioning", () => ({ provisionDealerAccount:m.provision }));
vi.mock("./dealer-application-repository", () => ({ getDealerApplication:m.application,getApplicationTemporaryPassword:m.password,recordApplicationProvisioning:m.record,updateDealerApplicationStatus:m.update }));
import { approveOwnDealer, ownDealerCredentials } from "./seller-approval";
const app = { id:"app",email:"buyer@example.test",status:"pending",referral:{sellerId:"eren"} };
beforeEach(() => {
 vi.resetAllMocks(); m.seller.mockResolvedValue({id:"eren",email:"eren@example.test",authorizedPerson:"Eren"}); m.application.mockResolvedValue({...app}); m.existing.mockResolvedValue(null); m.provision.mockResolvedValue({status:"created",accountId:"buyer",email:app.email,temporaryPassword:"temporary"});
});
it("approves own customer and records credentials and actor",async()=>{
 await approveOwnDealer("app"); expect(m.provision).toHaveBeenCalledWith(app,{sendWelcomeEmail:false});
 expect(m.record).toHaveBeenCalledWith("app",expect.objectContaining({accountId:"buyer",temporaryPassword:"temporary"}));
 expect(m.update).toHaveBeenCalledWith("app","approved","eren@example.test",expect.any(String));
});
it("rejects forged application IDs belonging to another seller",async()=>{
 m.application.mockResolvedValue({...app,referral:{sellerId:"other"}}); await expect(approveOwnDealer("other")).rejects.toThrow("yetkiniz"); expect(m.provision).not.toHaveBeenCalled();
});
it("rejects missing or unassigned applications",async()=>{
 for(const value of [null,{...app,referral:undefined}]) {m.application.mockResolvedValue(value);await expect(approveOwnDealer("app")).rejects.toThrow("yetkiniz");} expect(m.provision).not.toHaveBeenCalled();
});
it("does not reopen rejected applications or claim existing accounts",async()=>{
 m.application.mockResolvedValue({...app,status:"rejected",accountId:"buyer"});await expect(approveOwnDealer("app")).rejects.toThrow("uygun");
 m.application.mockResolvedValue(app);m.existing.mockResolvedValue({id:"existing"});await expect(approveOwnDealer("app")).rejects.toThrow("mevcut");expect(m.provision).not.toHaveBeenCalled();
});
it("repeated approval does not reset credentials",async()=>{
 m.application.mockResolvedValue({...app,status:"approved",accountId:"buyer"});await approveOwnDealer("app");expect(m.provision).not.toHaveBeenCalled();
});
it("rejects disabled or unauthenticated sellers before reading records",async()=>{
 m.seller.mockRejectedValue(new Error("unauthorized"));await expect(approveOwnDealer("app")).rejects.toThrow("unauthorized");expect(m.application).not.toHaveBeenCalled();
});
it("credentials require both application and account ownership and unchanged temporary password",async()=>{
 const approved={...app,status:"approved",accountId:"buyer"} as any;
 m.password.mockReturnValue("temporary");m.customers.mockResolvedValue([{id:"buyer",email:app.email,status:"approved",password:hashPassword("temporary"),mustChangePassword:true,referral:{sellerId:"eren"}}]);
 expect(await ownDealerCredentials(approved,"eren")).toEqual({email:app.email,password:"temporary"});expect(await ownDealerCredentials(approved,"other")).toBeNull();
 for(const patch of [{password:hashPassword("reset-password")},{mustChangePassword:false},{status:"suspended"},{referral:{sellerId:"other"}}]) {
 m.customers.mockResolvedValue([{id:"buyer",email:app.email,status:"approved",password:hashPassword("temporary"),mustChangePassword:true,referral:{sellerId:"eren"},...patch}]);expect(await ownDealerCredentials(approved,"eren")).toBeNull();
 }
});
