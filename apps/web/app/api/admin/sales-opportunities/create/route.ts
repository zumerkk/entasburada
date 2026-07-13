import { z } from "zod";
import { getAdminEmail, isAdminAuthenticated } from "../../../../../lib/admin-auth";
import { createSalesOpportunity } from "../../../../../lib/analytics-repository";

export const dynamic = "force-dynamic";

const schema = z.object({
  customerId: z.string().optional(),
  companyName: z.string().optional(),
  title: z.string().optional(),
  source: z.string().optional(),
  score: z.coerce.number().optional(),
  note: z.string().optional()
});

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
