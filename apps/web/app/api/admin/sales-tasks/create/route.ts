import { z } from "zod";
import { getAdminEmail, isAdminAuthenticated } from "../../../../../lib/admin-auth";
import { createSalesTask } from "../../../../../lib/analytics-repository";

export const dynamic = "force-dynamic";

const schema = z.object({
  customerId: z.string().optional(),
  companyName: z.string().optional(),
  assignee: z.string().optional(),
  dueAt: z.string().optional(),
  title: z.string().optional(),
  note: z.string().optional()
});

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
