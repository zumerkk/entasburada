import { isAdminAuthenticated } from "../../../../../lib/admin-auth";
import { exportImportJobXml } from "../../../../../lib/smart-import-repository";

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  if (!(await isAdminAuthenticated())) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = (await request.json()) as { jobId?: string };
    const xml = await exportImportJobXml(body.jobId ?? "");
    return new Response(xml, {
      headers: {
        "content-type": "application/xml; charset=utf-8",
        "content-disposition": `attachment; filename="${body.jobId ?? "import"}-efiyat.xml"`
      }
    });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "XML export failed" }, { status: 400 });
  }
}
