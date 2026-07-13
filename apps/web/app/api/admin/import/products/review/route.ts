import { isAdminAuthenticated } from "../../../../../../lib/admin-auth";
import { reviewImportProducts } from "../../../../../../lib/smart-import-repository";

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  if (!(await isAdminAuthenticated())) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = (await request.json()) as { jobId?: string; productIds?: unknown };
    const productIds = Array.isArray(body.productIds)
      ? body.productIds.filter((value): value is string => typeof value === "string")
      : [];
    const job = await reviewImportProducts(body.jobId ?? "", productIds);
    return Response.json({ job, reviewedCount: productIds.length });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Products could not be reviewed" }, { status: 400 });
  }
}
