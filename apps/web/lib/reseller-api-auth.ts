import "server-only";
import { authenticateSellerApiKey, getCurrentCustomer, type CustomerAccount } from "./customer-auth";

export type SellerCapability = "catalog" | "orders";

export interface AuthorizedSeller {
  customer: CustomerAccount;
  authType: "api_key" | "session";
}

export async function authorizeSellerRequest(request: Request, capability: SellerCapability): Promise<AuthorizedSeller | null> {
  const authorization = request.headers.get("authorization")?.trim() ?? "";
  if (authorization) {
    const match = authorization.match(/^Bearer\s+(.+)$/i);
    if (!match) return null;
    const customer = await authenticateSellerApiKey(match[1] ?? "");
    if (!customer || !hasCapability(customer, capability, true)) return null;
    return { customer, authType: "api_key" };
  }

  const customer = await getCurrentCustomer();
  if (!customer || !hasCapability(customer, capability, false)) return null;
  return { customer, authType: "session" };
}

function hasCapability(customer: CustomerAccount, capability: SellerCapability, apiRequest: boolean): boolean {
  const access = customer.sellerAccess;
  if (customer.status !== "approved" || !access?.enabled) return false;
  if (capability === "catalog") return access.productFeedEnabled && (!apiRequest || access.apiEnabled);
  return apiRequest ? access.apiEnabled && access.orderApiEnabled : access.mode === "dropshipping" || access.mode === "hybrid";
}
