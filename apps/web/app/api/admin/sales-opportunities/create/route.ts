import { z } from "zod";
import { getAdminEmail, isAdminAuthenticated } from "../../../../../lib/admin-auth";
import { createSalesOpportunity } from "../../../../../lib/analytics-repository";

export const dynamic = "force-dynamic";

const schema = z.object({
  customerId: z.string().trim().max(120).optional(),
  companyName: z.string().trim().max(300).optional(),
  title: z.string().trim().max(300).optional(),
  source: z.string().trim().max(120).optional(),
  score: z.coerce.number().min(0).max(1000).optional(),
  note: z.string().trim().max(4_000).optional()
}).strict();

export async function POST(request: Request): Promise<Response> {
  if (!(await isAdminAuthenticated())) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = schema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return Response.json({ error: "Invalid opportunity payload" }, { status: 400 });
  }

  return Response.json({ opportunity: await createSalesOpportunity(parsed.data, getAdminEmail()) }, { status: 201 });
}
