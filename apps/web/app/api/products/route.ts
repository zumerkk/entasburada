import { getPublicProducts } from "../../../lib/catalog-repository";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const limit = clampNumber(url.searchParams.get("limit"), 24, 1, 100);
  const page = clampNumber(url.searchParams.get("page"), 1, 1, 10000);
  const result = await getPublicProducts({
    q: url.searchParams.get("q") ?? "",
    category: url.searchParams.get("category") ?? "",
    categoryGroup: url.searchParams.get("group") ?? "",
    view: url.searchParams.get("view") ?? "",
    brand: url.searchParams.get("brand") ?? "",
    sourceKey: url.searchParams.get("sourceKey") ?? "",
    limit,
    offset: (page - 1) * limit
  });

  return Response.json({
    ...result,
    pricePolicy: "hidden_until_approved_dealer",
    stockPolicy: "all_active_products_in_stock",
    debug:
      process.env.NODE_ENV === "production"
        ? undefined
        : {
            filters: {
              q: url.searchParams.get("q") ?? "",
              category: url.searchParams.get("category") ?? "",
              group: url.searchParams.get("group") ?? "",
              view: url.searchParams.get("view") ?? ""
            }
          }
  });
}

function clampNumber(value: string | null, fallback: number, min: number, max: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.min(Math.max(Math.trunc(parsed), min), max);
}
