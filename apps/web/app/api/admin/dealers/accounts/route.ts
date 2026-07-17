import { z } from "zod";
import { isAdminAuthenticated } from "../../../../../lib/admin-auth";
import { getCustomers } from "../../../../../lib/customer-auth";
import { provisionDirectDealerAccount } from "../../../../../lib/dealer-provisioning";

export const dynamic = "force-dynamic";

const schema = z.object({
  email: z.string().email(),
  companyName: z.string().trim().min(2).max(160),
  authorizedPerson: z.string().trim().min(2).max(120),
  phone: z.string().trim().min(10).max(32),
  city: z.string().trim().min(2).max(80),
  deliveryAddress: z.string().trim().min(10).max(500),
  segment: z.enum(["standard", "industrial", "project"]).default("standard"),
  baseDiscountRate: z.number().min(0).max(50).optional(),
  temporaryPassword: z.string().trim().min(12).max(128).regex(/^\S+$/).optional(),
  sendWelcomeEmail: z.boolean().default(true)
});

export async function GET(): Promise<Response> {
  if (!(await isAdminAuthenticated())) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const accounts = (await getCustomers()).map(({ password: _password, ...account }) => account);
  return Response.json({ total: accounts.length, accounts });
}

export async function POST(request: Request): Promise<Response> {
  if (!(await isAdminAuthenticated())) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = schema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return Response.json({ error: "Geçersiz bayi hesabı bilgileri.", issues: parsed.error.flatten() }, { status: 400 });
  }

  const result = await provisionDirectDealerAccount(parsed.data);
  return Response.json(result, { status: result.status === "created" ? 201 : 200 });
}
