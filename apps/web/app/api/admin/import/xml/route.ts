import { getAdminEmail, isAdminAuthenticated } from "../../../../../lib/admin-auth";
import { fetchRemoteXml } from "../../../../../lib/remote-xml";
import { createXmlImportJob, createXmlImportJobFromFile } from "../../../../../lib/smart-import-repository";

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  if (!(await isAdminAuthenticated())) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const contentType = request.headers.get("content-type") ?? "";
    if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData();
      const file = formData.get("file");
      if (!(file instanceof File) || file.size === 0) {
        return Response.json({ error: "XML file required" }, { status: 400 });
      }
      return Response.json({ job: await createXmlImportJobFromFile(file, getAdminEmail()) }, { status: 201 });
    }

    const body = (await request.json()) as { xml?: string; url?: string; sourceName?: string };
    const xml = body.xml ?? (body.url ? await fetchRemoteXml(body.url) : "");
    if (!xml.trim()) {
      return Response.json({ error: "XML payload or url required" }, { status: 400 });
    }

    return Response.json(
      {
        job: await createXmlImportJob({
          xml,
          sourceName: body.sourceName ?? body.url ?? "XML import",
          fileName: body.url ?? "xml-import.xml",
          actor: getAdminEmail()
        })
      },
      { status: 201 }
    );
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "XML import failed" }, { status: 400 });
  }
}
