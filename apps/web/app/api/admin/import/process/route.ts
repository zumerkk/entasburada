import { isAdminAuthenticated } from "../../../../../lib/admin-auth";
import { processPdfImportBatch } from "../../../../../lib/smart-import-repository";

export const dynamic = "force-dynamic";
export const maxDuration = 180;

export async function POST(request: Request): Promise<Response> {
  if (!(await isAdminAuthenticated())) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = (await request.json()) as { jobId?: string; batchSize?: number };
    const job = await processPdfImportBatch(body.jobId ?? "", body.batchSize ?? 1);
    return Response.json({ job });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "PDF processing failed" }, { status: 400 });
  }
}
