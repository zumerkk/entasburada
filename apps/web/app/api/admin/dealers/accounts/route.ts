import { z } from "zod";
import { isAdminAuthenticated } from "../../../../../lib/admin-auth";
import {
  getCustomers,
  resetCustomerPasswordByAdmin,
  rotateSellerApiKey,
  updateCustomerAccount,
  updateSellerAccess,
  type CustomerAccount,
  type SellerAccess
} from "../../../../../lib/customer-auth";
import { provisionDirectDealerAccount } from "../../../../../lib/dealer-provisioning";
import { readJsonBody, requestErrorResponse } from "../../../../../lib/security";

export const dynamic = "force-dynamic";

const sellerAccessSchema = z.object({
  enabled: z.boolean().default(true),
  mode: z.enum(["reseller", "dropshipping", "hybrid"]).default("hybrid"),
  productFeedEnabled: z.boolean().default(true),
  apiEnabled: z.boolean().default(true),
  exactStockEnabled: z.boolean().default(true),
  orderApiEnabled: z.boolean().default(true),
  blindShippingEnabled: z.boolean().default(true),
  defaultMarkupRate: z.number().min(0).max(500).default(30)
}).strict();

const schema = z.object({
  email: z.string().email(),
  companyName: z.string().trim().min(2).max(160),
  authorizedPerson: z.string().trim().min(2).max(120),
  phone: z.string().trim().min(10).max(32),
  city: z.string().trim().min(2).max(80),
  deliveryAddress: z.string().trim().min(10).max(500),
  segment: z.enum(["standard", "industrial", "project"]).default("standard"),
  baseDiscountRate: z.literal(0).optional(),
  temporaryPassword: z.string().trim().min(12).max(128).regex(/^\S+$/).optional(),
  sendWelcomeEmail: z.boolean().default(true),
  sellerAccess: sellerAccessSchema.optional(),
  createApiKey: z.boolean().default(false)
}).strict();

const patchSchema = z.object({
  customerId: z.string().trim().min(1).max(160),
  status: z.enum(["approved", "pending", "suspended"]).optional(),
  sellerAccess: sellerAccessSchema.optional(),
  rotateApiKey: z.boolean().optional(),
  resetPassword: z.boolean().optional()
}).strict();

export async function GET(): Promise<Response> {
  if (!(await isAdminAuthenticated())) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const accounts = (await getCustomers()).map(sanitizeAccount);
  return Response.json({ total: accounts.length, accounts });
}

export async function POST(request: Request): Promise<Response> {
  if (!(await isAdminAuthenticated())) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const parsed = schema.safeParse(await readJsonBody<unknown>(request, 32 * 1024));
    if (!parsed.success) {
      return Response.json({ error: "Geçersiz bayi hesabı bilgileri.", issues: parsed.error.flatten() }, { status: 400 });
    }

    const { createApiKey, ...input } = parsed.data;
    const result = await provisionDirectDealerAccount(input);
    const generated = result.status === "created" && createApiKey && input.sellerAccess?.enabled && input.sellerAccess.apiEnabled
      ? await rotateSellerApiKey(result.accountId)
      : null;
    return Response.json({ ...result, ...(generated ? { apiKey: generated.apiKey, account: sanitizeAccount(generated.account) } : {}) }, { status: result.status === "created" ? 201 : 200 });
  } catch (error) {
    return requestErrorResponse(error, "Bayi hesabı oluşturulamadı.");
  }
}

export async function PATCH(request: Request): Promise<Response> {
  if (!(await isAdminAuthenticated())) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const parsed = patchSchema.safeParse(await readJsonBody<unknown>(request, 32 * 1024));
    if (!parsed.success) {
      return Response.json({ error: "Geçersiz hesap yönetimi isteği.", issues: parsed.error.flatten() }, { status: 400 });
    }

    const { customerId, status, sellerAccess, rotateApiKey, resetPassword } = parsed.data;
    let account = await updateCustomerAccount(customerId, { ...(status ? { status } : {}) });
    if (sellerAccess) account = await updateSellerAccess(customerId, sellerAccess as SellerAccess);
    const credentials: { apiKey?: string; temporaryPassword?: string } = {};
    if (rotateApiKey) {
      const result = await rotateSellerApiKey(customerId);
      account = result.account;
      credentials.apiKey = result.apiKey;
    }
    if (resetPassword) {
      const result = await resetCustomerPasswordByAdmin(customerId);
      account = result.account;
      credentials.temporaryPassword = result.temporaryPassword;
    }

    return Response.json({ account: sanitizeAccount(account), ...credentials });
  } catch (error) {
    return requestErrorResponse(error, "Hesap güncellenemedi.");
  }
}

function sanitizeAccount(account: CustomerAccount): Omit<CustomerAccount, "password"> {
  const { password: _password, sellerAccess, ...rest } = account;
  if (!sellerAccess) return rest;
  const { apiKeyHash: _apiKeyHash, ...safeSellerAccess } = sellerAccess;
  return { ...rest, sellerAccess: safeSellerAccess as SellerAccess };
}
