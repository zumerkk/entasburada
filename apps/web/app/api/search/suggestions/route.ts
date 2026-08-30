import { getCatalogSearchSuggestions } from "../../../../lib/catalog-repository";
import { consumeRateLimit } from "../../../../lib/rate-limit";
import { getClientAddress } from "../../../../lib/security";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const limit = await consumeRateLimit("search-suggestions", getClientAddress(request.headers), { limit: 180, windowMs: 60_000 });
  if (!limit.allowed) {
    return Response.json({ suggestions: [] }, { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } });
  }

  const query = new URL(request.url).searchParams.get("q")?.trim().slice(0, 120) ?? "";
  const result = await getCatalogSearchSuggestions(query, 8);
  return Response.json(result, {
    headers: { "Cache-Control": "private, max-age=30" }
  });
}
