import { isAdminAuthenticated } from "../../../../lib/admin-auth";
import { getAdminProducts } from "../../../../lib/catalog-repository";
import type { ProductStatus, StockStatus } from "@entas/catalog";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  if (!(await isAdminAuthenticated())) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const limit = clampNumber(url.searchParams.get("limit"), 50, 1, 200);
  const page = clampNumber(url.searchParams.get("page"), 1, 1, 10000);
  const result = await getAdminProducts({
    q: url.searchParams.get("q") ?? "",
    category: url.searchParams.get("category") ?? "",
    brand: url.searchParams.get("brand") ?? "",
    sourceKey: url.searchParams.get("sourceKey") ?? "",
    stockStatus: toStockStatus(url.searchParams.get("stockStatus") ?? ""),
    status: toProductStatus(url.searchParams.get("status") ?? ""),
    limit,
    offset: (page - 1) * limit
  });

  return Response.json(result);
}

function toStockStatus(value: string): StockStatus | "all" {
  return value === "in_stock" || value === "low_stock" || value === "incoming" || value === "out_of_stock" ? value : "all";
}

function toProductStatus(value: string): ProductStatus | "all" {
  return value === "DRAFT" || value === "ACTIVE" || value === "PASSIVE" ? value : "all";
}

function clampNumber(value: string | null, fallback: number, min: number, max: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.min(Math.max(Math.trunc(parsed), min), max);
}
