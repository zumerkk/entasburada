import { getCatalogOverview } from "../../../lib/catalog-repository";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const { store, importReport } = await getCatalogOverview();

  return Response.json({
    ok: true,
    app: "entasburada",
    timestamp: new Date().toISOString(),
    release: {
      provider: process.env.RENDER === "true" ? "render" : "local",
      commit: process.env.RENDER_GIT_COMMIT?.slice(0, 12) ?? null,
      branch: process.env.RENDER_GIT_BRANCH ?? null
    },
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
