import { getCatalogOverview } from "../../../lib/catalog-repository";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const { store, importReport } = await getCatalogOverview();

  return Response.json({
    ok: true,
    app: "entasburada",
    timestamp: new Date().toISOString(),
    ports: {
      web: 3000,
      admin: "/admin"
    },
    catalog: store.importSummary,
    importReport: importReport
      ? {
          generatedAt: importReport.generatedAt,
          products: importReport.totals.products,
          sources: importReport.sources.map((source) => ({
            key: source.key,
            acceptedRows: source.acceptedRows,
            issueCount: source.issueCount
          }))
        }
      : null
  });
}
