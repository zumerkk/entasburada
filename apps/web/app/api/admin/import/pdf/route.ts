import { getAdminEmail, isAdminAuthenticated } from "../../../../../lib/admin-auth";
import { createPdfImportJobFromFile } from "../../../../../lib/smart-import-repository";

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  if (!(await isAdminAuthenticated())) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const formData = await request.formData();
    const file = formData.get("file");
    if (!(file instanceof File) || file.size === 0) {
      return Response.json({ error: "PDF file required" }, { status: 400 });
    }

    const startPage = getNumber(formData, "startPage");
    const endPage = getNumber(formData, "endPage");
    const job = await createPdfImportJobFromFile(file, getAdminEmail(), {
      sourceName: getString(formData, "sourceName"),
      brandHint: getString(formData, "brandHint"),
      categoryHint: getString(formData, "categoryHint"),
      defaultCurrency: getString(formData, "defaultCurrency") || "TRY",
      ...(startPage === undefined ? {} : { startPage }),
      ...(endPage === undefined ? {} : { endPage })
    });
    return Response.json({ job }, { status: 201 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "PDF import failed" }, { status: 400 });
  }
}

function getString(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function getNumber(formData: FormData, key: string): number | undefined {
  const value = getString(formData, key);
  const parsed = Number(value);
  return value && Number.isFinite(parsed) ? parsed : undefined;
}
