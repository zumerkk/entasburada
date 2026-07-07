import { getPublicProducts } from "../../../lib/catalog-repository";
import type { StockStatus } from "@entas/catalog";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const limit = clampNumber(url.searchParams.get("limit"), 24, 1, 100);
  const page = clampNumber(url.searchParams.get("page"), 1, 1, 10000);
  const stockStatus = toStockStatus(url.searchParams.get("stockStatus") ?? "");
  const result = await getPublicProducts({
    q: url.searchParams.get("q") ?? "",
    category: url.searchParams.get("category") ?? "",
    categoryGroup: url.searchParams.get("group") ?? "",
    view: url.searchParams.get("view") ?? "",
    brand: url.searchParams.get("brand") ?? "",
    sourceKey: url.searchParams.get("sourceKey") ?? "",
    stockStatus,
    limit,
    offset: (page - 1) * limit
  });

  return Response.json({
    ...result,
    pricePolicy: "hidden_until_approved_dealer",
    stockPolicy: "masked_status_only",
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

function toStockStatus(value: string): StockStatus | "all" {
  return value === "in_stock" || value === "low_stock" || value === "incoming" || value === "out_of_stock" ? value : "all";
}

function clampNumber(value: string | null, fallback: number, min: number, max: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.min(Math.max(Math.trunc(parsed), min), max);
}
