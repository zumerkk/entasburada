import { authorizeSellerRequest } from "../../../../../lib/reseller-api-auth";
import {
  getSellerCatalog,
  serializeSellerProductsCsv,
  serializeSellerProductsXml,
  type SellerStockFilter
} from "../../../../../lib/reseller-catalog";
import { consumeRateLimit } from "../../../../../lib/rate-limit";

export const dynamic = "force-dynamic";

const STOCK_FILTERS: SellerStockFilter[] = ["all", "available", "low_stock", "incoming", "out_of_stock"];

export async function GET(request: Request): Promise<Response> {
  const seller = await authorizeSellerRequest(request, "catalog");
  if (!seller) return json({ error: "Geçerli satıcı oturumu veya API anahtarı gerekli." }, 401);

  const rate = await consumeRateLimit("reseller-products-api", seller.customer.id, { limit: 180, windowMs: 60_000 });
  if (!rate.allowed) return json({ error: "İstek sınırı aşıldı. Bir dakika sonra tekrar deneyin." }, 429);

  const url = new URL(request.url);
  const format = parseFormat(url.searchParams.get("format"));
  const page = clamp(url.searchParams.get("page"), 1, 1, 100_000);
  const stock = parseStock(url.searchParams.get("stock"));
  const limit = format === "json" ? clamp(url.searchParams.get("limit"), 100, 1, 250) : 10_000;
  const baseUrl = configuredBaseUrl(url.origin);
  const catalog = await getSellerCatalog(seller.customer, {
    q: url.searchParams.get("q") ?? "",
    stock,
    limit,
    offset: format === "json" ? (page - 1) * limit : 0,
    baseUrl
  });

  if (format === "csv") {
    return new Response(`\uFEFF${serializeSellerProductsCsv(catalog.items)}`, {
      headers: downloadHeaders("text/csv; charset=utf-8", "entasburada-urunler.csv")
    });
  }
  if (format === "xml") {
    return new Response(serializeSellerProductsXml(catalog.items), {
      headers: downloadHeaders("application/xml; charset=utf-8", "entasburada-urunler.xml")
    });
  }

  const pageCount = Math.max(1, Math.ceil(catalog.total / catalog.limit));
  return json({
    apiVersion: "v1",
    generatedAt: new Date().toISOString(),
    pricePolicy: "KDV dahil satıcı alış fiyatı",
    exactStock: Boolean(seller.customer.sellerAccess?.exactStockEnabled),
    pagination: {
      page: Math.floor(catalog.offset / catalog.limit) + 1,
      limit: catalog.limit,
      total: catalog.total,
      pageCount
    },
    summary: catalog.summary,
    products: catalog.items
  });
}

function json(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: { "Cache-Control": "private, no-store", Vary: "Authorization, Cookie" } });
}

function downloadHeaders(contentType: string, filename: string): HeadersInit {
  return {
    "Content-Type": contentType,
    "Content-Disposition": `attachment; filename="${filename}"`,
    "Cache-Control": "private, no-store",
    Vary: "Authorization, Cookie",
    "X-Content-Type-Options": "nosniff"
  };
}

function clamp(value: string | null, fallback: number, min: number, max: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, Math.trunc(parsed))) : fallback;
}

function parseFormat(value: string | null): "json" | "csv" | "xml" {
  return value === "csv" || value === "xml" ? value : "json";
}

function parseStock(value: string | null): SellerStockFilter {
  return STOCK_FILTERS.includes(value as SellerStockFilter) ? (value as SellerStockFilter) : "all";
}

function configuredBaseUrl(fallback: string): string {
  const value = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (!value) return fallback;
  try {
    return new URL(value).origin;
  } catch {
    return fallback;
  }
}
