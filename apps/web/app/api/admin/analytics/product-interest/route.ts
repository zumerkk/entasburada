import { isAdminAuthenticated } from "../../../../../lib/admin-auth";
import { getProductInterestReport } from "../../../../../lib/analytics-repository";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  if (!(await isAdminAuthenticated())) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  return Response.json(await getProductInterestReport());
}
