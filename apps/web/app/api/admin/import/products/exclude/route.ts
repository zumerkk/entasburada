import { isAdminAuthenticated } from "../../../../../../lib/admin-auth";
import { setImportProductsExcluded } from "../../../../../../lib/smart-import-repository";

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  if (!(await isAdminAuthenticated())) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = (await request.json()) as { jobId?: string; productIds?: unknown; excluded?: unknown };
    const productIds = Array.isArray(body.productIds)
      ? body.productIds.filter((value): value is string => typeof value === "string")
      : [];
    return Response.json({
      job: await setImportProductsExcluded(body.jobId ?? "", productIds, body.excluded !== false)
    });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Products could not be updated" }, { status: 400 });
  }
}
