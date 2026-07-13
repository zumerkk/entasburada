import { isAdminAuthenticated } from "../../../../../lib/admin-auth";
import { resetPdfImportPages } from "../../../../../lib/smart-import-repository";

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  if (!(await isAdminAuthenticated())) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = (await request.json()) as { jobId?: string; pages?: unknown };
    const pages = Array.isArray(body.pages)
      ? body.pages.map(Number).filter((page) => Number.isInteger(page))
      : [];
    return Response.json({ job: await resetPdfImportPages(body.jobId ?? "", pages) });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "PDF pages could not be queued again" }, { status: 400 });
  }
}
