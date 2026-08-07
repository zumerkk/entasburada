import { z } from "zod";
import { getAdminEmail, isAdminAuthenticated } from "../../../../../lib/admin-auth";
import { createSalesTask } from "../../../../../lib/analytics-repository";

export const dynamic = "force-dynamic";

const schema = z.object({
  customerId: z.string().trim().max(120).optional(),
  companyName: z.string().trim().max(300).optional(),
  assignee: z.string().trim().max(200).optional(),
  dueAt: z.string().trim().max(80).optional(),
  title: z.string().trim().max(300).optional(),
  note: z.string().trim().max(4_000).optional()
}).strict();

export async function POST(request: Request): Promise<Response> {
  if (!(await isAdminAuthenticated())) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = schema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return Response.json({ error: "Invalid task payload" }, { status: 400 });
  }

  return Response.json({ task: await createSalesTask(parsed.data, getAdminEmail()) }, { status: 201 });
}
