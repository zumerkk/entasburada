import { getAdminEmail, isAdminAuthenticated } from "../../../../../lib/admin-auth";
import { approveImportJob } from "../../../../../lib/smart-import-repository";

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  if (!(await isAdminAuthenticated())) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = (await request.json()) as { jobId?: string };
    return Response.json(await approveImportJob(body.jobId ?? "", getAdminEmail()));
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Approve failed" }, { status: 400 });
  }
}
