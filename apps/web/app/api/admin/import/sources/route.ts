import { isAdminAuthenticated } from "../../../../../lib/admin-auth";
import { loadImportJobs } from "../../../../../lib/smart-import-repository";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  if (!(await isAdminAuthenticated())) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const jobs = await loadImportJobs();
  return Response.json({
    supportedSources: ["xml_url", "xml_file", "csv", "xlsx", "json", "pdf", "image", "zip", "external_link"],
    jobs: jobs.map((job) => ({
      id: job.id,
      type: job.type,
      status: job.status,
      sourceName: job.sourceName,
      fileName: job.fileName,
      createdAt: job.createdAt,
      totalRecords: job.totalRecords,
      acceptedRecords: job.acceptedRecords,
      qualityIssueCount: job.qualityIssues.length,
      progressPercent: job.pdfProgress?.percent,
      pageCount: job.pdfProgress?.pageCount,
      processedPages: job.pdfProgress?.processedPages,
      providerStats: job.providerStats,
      lastError: job.lastError
    }))
  });
}
