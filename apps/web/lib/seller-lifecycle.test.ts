import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { mkdtemp, mkdir, readFile, writeFile, rm } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { createEmptyCatalogStore, type CatalogProductRecord } from "@entas/catalog";
import type { CustomerAccount } from "./customer-auth";
import type { AdminOrder } from "./commercial-repository";

// Only framework request context and outbound email are substituted.
// Accounts, applications, cart, pricing, orders, notifications and dashboard use real repositories.
vi.mock("server-only", () => ({}));
const context = vi.hoisted(() => ({ cookies: new Map<string,string>(), mail: vi.fn(async () => true) }));
vi.mock("next/headers", () => ({ cookies:async () => ({get:(name:string) => {const value=context.cookies.get(name);return value ? {value} : undefined;}}), headers:async () => new Headers({"x-forwarded-for":"127.0.0.1"}) }));
vi.mock("next/navigation", () => ({ redirect:(url:string) => {throw new Error(`REDIRECT:${url}`);}, notFound:() => {throw new Error("NOT_FOUND");} }));
vi.mock("next/cache", () => ({ revalidatePath:vi.fn() }));
vi.mock("./mailer", () => ({ sendMail:context.mail }));

let dir:string;
let auth: typeof import("./customer-auth");
let applications: typeof import("./dealer-application-repository");
let commercial: typeof import("./commercial-repository");
let dashboard: typeof import("./seller-dashboard");
let register: typeof import("../app/dealer-application/actions");
let adminActions: typeof import("../app/admin/actions");
let adminAuth: typeof import("./admin-auth");
let cart: typeof import("./cart-repository");
let checkout: typeof import("./cart-checkout");
let commissions: typeof import("../app/admin/sellers/actions");
let csv: typeof import("../app/api/seller/commissions/route");
let eren:CustomerAccount;
let other:CustomerAccount;
let sequence=0;
const secret="isolated-seller-lifecycle-test-secret-2026";
const product:CatalogProductRecord={id:"test-product",sourceKey:"test",sourceName:"Test",externalId:"1",sku:"E2E-1",slug:"e2e-batarya",name:"E2E Batarya",brand:"EUROMIX",categoryPath:["Test"],category:"Test",unitType:"Adet",taxRate:"20",currency:"TRY",listPrice:"1250.00",stockQuantity:1000,stockStatus:"in_stock",status:"ACTIVE",isVisible:true,priceApprovalStatus:"APPROVED",priceDisplayMode:"HIDDEN_UNTIL_DEALER",importedAt:"2026-09-16T00:00:00Z",createdAt:"2026-09-16T00:00:00Z",updatedAt:"2026-09-16T00:00:00Z"};

beforeAll(async () => {
  dir=await mkdtemp(path.join(tmpdir(),"entas-seller-lifecycle-"));
  await mkdir(path.join(dir,"data")); await writeFile(path.join(dir,"pnpm-workspace.yaml"),"packages: []\n");
  const store=createEmptyCatalogStore("2026-09-16T00:00:00Z");store.products=[product,{...product,id:"second",sku:"E2E-2",slug:"e2e-vana",name:"E2E Vana",listPrice:"250.00"}];
  await writeFile(path.join(dir,"data/catalog-store.json"),JSON.stringify(store));
  vi.stubEnv("AUTH_SECRET",secret);vi.stubEnv("ADMIN_SESSION_SECRET",secret);vi.stubEnv("DEALER_CREDENTIAL_SECRET",secret);vi.stubEnv("ADMIN_EMAIL","admin@example.test");
  vi.stubEnv("ENTAS_COMMERCIAL_DATA_DIR",path.join(dir,"data"));vi.stubEnv("ENTAS_CART_DATA_DIR",path.join(dir,"data"));
  const cwd=vi.spyOn(process,"cwd").mockReturnValue(dir);
  auth=await import("./customer-auth");applications=await import("./dealer-application-repository");commercial=await import("./commercial-repository");dashboard=await import("./seller-dashboard");
  register=await import("../app/dealer-application/actions");adminActions=await import("../app/admin/actions");adminAuth=await import("./admin-auth");cart=await import("./cart-repository");checkout=await import("./cart-checkout");commissions=await import("../app/admin/sellers/actions");csv=await import("../app/api/seller/commissions/route");
  cwd.mockRestore();
  const base={companyName:"Satıcı Test",phone:"05320000000",city:"İstanbul",deliveryAddress:"İzole test teslimat adresi",status:"approved" as const,segment:"standard" as const,baseDiscountRate:0,brandDiscounts:{},categoryDiscounts:{},specialNetPrices:{},plainPassword:"Isolated-Test-2026!",sellerAccess:auth.normalizeSellerAccess({enabled:true})};
  eren=await auth.createCustomerAccount({...base,id:"seller-eren",authorizedPerson:"Eren",email:"eren@example.test"});
  other=await auth.createCustomerAccount({...base,id:"seller-other",authorizedPerson:"Diğer Satıcı",email:"other@example.test"});
});
afterAll(async () => { vi.restoreAllMocks();vi.unstubAllEnvs();if(dir) await rm(dir,{recursive:true,force:true}); });
function login(customer:CustomerAccount) {context.cookies.set(auth.CUSTOMER_COOKIE,auth.createCustomerSessionToken(customer));}
function loginAdmin() {context.cookies.set(adminAuth.ADMIN_COOKIE,adminAuth.createAdminSession());}
function form(source:"seller"|"code"|"none", seller=eren) {
  sequence++;
  const data=new FormData();
  Object.entries({companyTitle:`E2E Müşteri ${sequence}`,authorizedPerson:`Müşteri ${sequence}`,email:`buyer-${sequence}@example.test`,taxOffice:"Merkez",taxNumber:String(1000000000+sequence),companyType:"dealer",phone:"05320000001",invoiceAddress:"İzole test fatura adresi",deliveryAddress:"İzole test teslimat adresi",city:"İstanbul",district:"Kadıköy",activityArea:"Hırdavat",dealershipType:"standard",kvkkAccepted:"on"}).forEach(([k,v])=>data.set(k,v));
  if(source==="seller")data.set("sellerEntry","1");
  if(source!=="none")data.set("referralCode",auth.sellerReferenceCode(seller));
  return data;
}
async function submit(data:FormData) {
  await expect(register.submitDealerApplicationAction(data)).rejects.toThrow("REDIRECT:");
  const app=(await applications.listDealerApplications()).find(a=>a.email===data.get("email"));
  expect(app).toBeDefined();return app!;
}
async function approve(id:string) {
  loginAdmin();const data=new FormData();data.set("applicationId",id);data.set("status","approved");
  await adminActions.updateDealerApplicationStatusAction(data);
  const app=(await applications.getDealerApplication(id))!;
  expect(app.status).toBe("approved");expect(app.accountId).toBeTruthy();
  return (await auth.findCustomerByEmail(app.email))!;
}
async function newBuyer(source:"seller"|"code"|"none"="seller",seller=eren) {
  login(seller);return approve((await submit(form(source,seller))).id);
}
async function buy(customer:CustomerAccount,quantity=2):Promise<AdminOrder> {
  await cart.addCartItems(customer,[{sku:"E2E-1",quantity},{sku:"E2E-2",quantity:1}]);
  const priced=await cart.loadPricedCart(customer);expect(priced.canCreateOrder).toBe(true);
  const order=await checkout.createOrderFromCustomerCart(customer);
  expect((await cart.loadCustomerCart(customer)).items).toHaveLength(0);
  return order;
}
async function settle(order:AdminOrder) {
  loginAdmin();const form=new FormData();Object.entries({orderId:order.id,revision:String(order.sellerCommission!.revision),operation:"settle",reference:"TEST-DEKONT-001"}).forEach(([k,v])=>form.set(k,v));
  await expect(commissions.commissionAction(form)).rejects.toThrow("REDIRECT:/admin/sellers?ok=1");
  return (await commercial.getAdminOrderById(order.id))!;
}

describe("real persisted Eren seller lifecycle",()=>{
  it("panel registration appears in the admin repository/notifications and Eren only; approval keeps attribution",async()=>{
    login(eren);const input=form("seller");input.set("referralCode",auth.sellerReferenceCode(other));
    const app=await submit(input);
    expect(app.referral).toMatchObject({sellerId:eren.id,sellerName:"Eren",source:"seller"});
    expect((await dashboard.sellerDashboard(eren.id)).applications.some(a=>a.id===app.id)).toBe(true);
    expect((await dashboard.sellerDashboard(other.id)).applications.some(a=>a.id===app.id)).toBe(false);
    const notifications=JSON.parse(await readFile(path.join(dir,"data/notifications.json"),"utf8"));expect(notifications.some((n:{recipientType:string;body:string})=>n.recipientType==="admin"&&n.body.includes(app.companyTitle))).toBe(true);
    const customer=await approve(app.id);expect(customer.referral?.sellerId).toBe(eren.id);expect(customer.mustChangePassword).toBe(true);
    expect((await dashboard.sellerDashboard(eren.id)).customers.some(c=>c.id===customer.id)).toBe(true);
    const approved=(await applications.getDealerApplication(app.id))!;
    const password=applications.getApplicationTemporaryPassword(approved)!;
    expect((await auth.authenticateCustomer(customer.email,password))?.id).toBe(customer.id);
    login(customer);expect(await auth.getCurrentCustomer()).toBeNull();
    const activated=await auth.changeCustomerPassword(customer.id,password,"New-Isolated-2026!");login(activated);
    expect((await auth.getCurrentCustomer())?.id).toBe(customer.id);
    expect(applications.getApplicationTemporaryPassword((await applications.getDealerApplication(app.id))!)).toBeNull();
    expect(context.mail).toHaveBeenCalledWith(expect.objectContaining({to:customer.email}));
  });
  it("optional public code links to Eren, missing code leaves account unassigned",async()=>{
    context.cookies.delete(auth.CUSTOMER_COOKIE);
    const referenced=await approve((await submit(form("code"))).id);expect(referenced.referral?.sellerId).toBe(eren.id);
    const plain=await approve((await submit(form("none"))).id);expect(plain.referral).toBeUndefined();
    expect((await buy(plain)).sellerCommission).toBeUndefined();
  });
  it("customer checkout creates two product commissions and the admin order shows Eren; pays only after collection and delivery",async()=>{
    const buyer=await newBuyer();const order=await buy(buyer);
    expect(order.totalAmount).toBe("2750.00");expect(order.sellerCommission?.lines).toHaveLength(2);
    expect((await commercial.searchAdminOrders({q:order.orderNo})).items[0]?.sellerCommission?.referral.sellerName).toBe("Eren");
    const {commissionSummary}=await import("./seller-commission");
    expect(commissionSummary(order.sellerCommission!,order.status,order.paymentStatus)).toMatchObject({earnedCents:27500,pendingCents:27500,payableCents:0});
    await commercial.updateOrderOperation({orderId:order.id,paymentStatus:"Kartla ödendi (ZiraatPay)",status:"SHIPPED"},"Test Admin");
    let saved=(await commercial.getAdminOrderById(order.id))!;expect(commissionSummary(saved.sellerCommission!,saved.status,saved.paymentStatus).payableCents).toBe(0);
    saved=await commercial.updateOrderOperation({orderId:order.id,status:"DELIVERED"},"Test Admin");
    expect(commissionSummary(saved.sellerCommission!,saved.status,saved.paymentStatus).payableCents).toBe(27500);
    saved=await settle(saved);expect(saved.sellerCommission?.paidCents).toBe(27500);
    login(eren);const download=await csv.GET();expect(download.status).toBe(200);expect(await download.text()).toContain(order.orderNo);
    login(other);expect(await (await csv.GET()).text()).not.toContain(order.orderNo);
  });
  it("repeat purchases remain with original seller and other seller purchases remain isolated",async()=>{
    const buyer=await newBuyer();const first=await buy(buyer,1);const second=await buy(buyer,3);
    expect(first.id).not.toBe(second.id);expect(second.sellerCommission?.referral.sellerId).toBe(eren.id);
    const otherBuyer=await newBuyer("seller",other);const otherOrder=await buy(otherBuyer);
    expect((await dashboard.sellerDashboard(eren.id)).orders.some(o=>o.id===otherOrder.id)).toBe(false);
    expect((await dashboard.sellerDashboard(other.id)).orders.map(o=>o.id)).toContain(otherOrder.id);
  });
  it("invalid/past-account/self referrals cannot claim a customer; duplicate application creates one row",async()=>{
    login(eren);const invalid=form("code");invalid.set("referralCode","NOT-A-CODE");expect((await register.submitDealerApplicationAction(invalid)).error).toContain("geçersiz");
    const self=form("code");self.set("email",eren.email);expect((await register.submitDealerApplicationAction(self)).error).toContain("zaten kayıtlı");
    const valid=form("seller");const app=await submit(valid);expect((await register.submitDealerApplicationAction(valid)).error).toContain("zaten var");
    expect((await applications.listDealerApplications()).filter(a=>a.email===app.email)).toHaveLength(1);
    await approve(app.id);expect((await register.submitDealerApplicationAction(valid)).error).toContain("zaten kayıtlı");
  });
  it("cancelled sales remove commission and refunds after payout retain history and create recovery",async()=>{
    const buyer=await newBuyer();const order=await buy(buyer);
    const ready=await commercial.updateOrderOperation({orderId:order.id,status:"COMPLETED",paymentStatus:"Ödendi"},"Admin");
    const paid=await settle(ready);
    const line=paid.sellerCommission!.lines[0]!;
    await commercial.updateSellerCommission({orderId:paid.id,revision:1,operation:"refund",itemId:line.itemId,quantity:1,reference:"TEST-IADE-001"},"Admin");
    const {commissionSummary}=await import("./seller-commission");let saved=(await commercial.getAdminOrderById(order.id))!;
    expect(commissionSummary(saved.sellerCommission!,saved.status,saved.paymentStatus)).toMatchObject({earnedCents:15000,paidCents:27500,recoveryCents:12500,payableCents:0});
    saved=await commercial.updateOrderOperation({orderId:order.id,status:"CANCELLED"},"Admin");
    expect(commissionSummary(saved.sellerCommission!,saved.status,saved.paymentStatus)).toMatchObject({earnedCents:0,recoveryCents:27500,pendingCents:0});
    expect(saved.sellerCommission?.payments).toHaveLength(1);
  });
  it("rejects a second referral for an approved company using another email",async()=>{
    login(eren);const original=form("seller");await approve((await submit(original)).id);
    login(other);const duplicate=form("seller",other);duplicate.set("taxNumber",String(original.get("taxNumber")));
    const result=await register.submitDealerApplicationAction(duplicate);
    expect(result.error).toContain("zaten var");
  });
  it("persists both admin and customer notifications from order creation",async()=>{
    const order=await buy(await newBuyer());
    const notifications=JSON.parse(await readFile(path.join(dir,"data/notifications.json"),"utf8")) as {recipientType:string;body:string}[];
    expect(notifications.some(n=>n.recipientType==="admin"&&n.body.includes(order.orderNo))).toBe(true);
    expect(notifications.some(n=>n.recipientType==="customer"&&n.body.includes(order.orderNo))).toBe(true);
  });
  it("rejects anonymous admin mutations, anonymous CSV and disabled seller sessions",async()=>{
    context.cookies.delete(adminAuth.ADMIN_COOKIE);await expect(adminActions.updateDealerApplicationStatusAction(new FormData())).rejects.toThrow("REDIRECT:/admin/login");
    await expect(commissions.commissionAction(new FormData())).rejects.toThrow("REDIRECT:/admin/login");
    context.cookies.delete(auth.CUSTOMER_COOKIE);expect((await csv.GET()).status).toBe(403);
    login(other);await auth.updateCustomerAccount(other.id,{status:"suspended"});expect(await auth.getCurrentCustomer()).toBeNull();expect((await csv.GET()).status).toBe(403);
    const data=form("code",other);expect((await register.submitDealerApplicationAction(data)).error).toContain("geçersiz");
    await auth.updateCustomerAccount(other.id,{status:"approved"});
  });
  it("admin switches Eren to Pazarlamacı: same price as his customers, panel and commission stay, reseller tools close",async()=>{
    const buyer=await newBuyer();
    await cart.addCartItems(eren,[{sku:"E2E-1",quantity:1}]);
    expect((await cart.loadPricedCart(eren)).items[0]?.unitNetPrice).toBe("1500.00");
    loginAdmin();const data=new FormData();
    Object.entries({customerId:eren.id,status:"approved",segment:"standard",sellerMode:"referral",defaultMarkupRate:"30",sellerEnabled:"on",productFeedEnabled:"on",exactStockEnabled:"on",apiEnabled:"on",orderApiEnabled:"on",blindShippingEnabled:"on"}).forEach(([k,v])=>data.set(k,v));
    await expect(adminActions.updateDealerAccountAction(data)).rejects.toThrow("REDIRECT:/admin/dealers?ok=");
    const marketer=(await auth.findCustomerByEmail(eren.email))!;
    expect(marketer.sellerAccess).toMatchObject({enabled:true,mode:"referral",productFeedEnabled:false,exactStockEnabled:false,apiEnabled:false,orderApiEnabled:false,blindShippingEnabled:false});
    await cart.addCartItems(buyer,[{sku:"E2E-1",quantity:1}]);
    const buyerPrice=(await cart.loadPricedCart(buyer)).items[0]?.unitNetPrice;
    await cart.clearCart(buyer);
    expect(buyerPrice).toBe("1250.00");
    expect((await cart.loadPricedCart(marketer)).items[0]?.unitNetPrice).toBe(buyerPrice);
    await cart.clearCart(marketer);
    login(marketer);expect((await dashboard.requireReferralSeller()).id).toBe(eren.id);
    const {authorizeSellerRequest}=await import("./reseller-api-auth");const request=new Request("https://entasburada.com/api/reseller/v1/products");
    expect(await authorizeSellerRequest(request,"catalog")).toBeNull();expect(await authorizeSellerRequest(request,"orders")).toBeNull();
    expect((await buy(buyer)).sellerCommission?.referral.sellerId).toBe(eren.id);
  });
});
