import { z } from "zod";
import { trackCategoryViewEvent, trackSearchEvent } from "../../../../lib/analytics-repository";
import { getCurrentCustomer } from "../../../../lib/customer-auth";
import { consumeRateLimit } from "../../../../lib/rate-limit";
import { getClientAddress, readJsonBody, requestErrorResponse } from "../../../../lib/security";

export const dynamic = "force-dynamic";

const schema = z.object({
  searchTerm: z.string().trim().max(300).optional().default(""),
  resultCount: z.coerce.number().min(0).max(100000).default(0),
  category: z.string().trim().max(240).optional().default(""),
  brand: z.string().trim().max(160).optional().default(""),
  eventKind: z.enum(["search", "category_view"]).default("search"),
  sessionId: z.string().trim().max(120).optional()
}).strict();

export async function POST(request: Request): Promise<Response> {
  try {
    const limit = await consumeRateLimit("event-search", getClientAddress(request.headers), { limit: 120, windowMs: 60_000 });
    if (!limit.allowed) {
      return Response.json({ error: "Too many events" }, { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } });
    }
    const parsed = schema.safeParse(await readJsonBody<unknown>(request, 16 * 1024));
    if (!parsed.success) return Response.json({ error: "Invalid search event" }, { status: 400 });

    const customer = await getCurrentCustomer();
    const meta = requestMeta(request, parsed.data.sessionId);
    if (parsed.data.eventKind === "category_view") {
      await trackCategoryViewEvent(customer, parsed.data.category || parsed.data.searchTerm || "Katalog", meta);
    } else {
      await trackSearchEvent(
        customer,
        {
          searchTerm: parsed.data.searchTerm,
          resultCount: parsed.data.resultCount,
          category: parsed.data.category,
          brand: parsed.data.brand
        },
        meta
      );
    }

    return Response.json({ ok: true }, { status: 201 });
  } catch (error) {
    return requestErrorResponse(error, "Search event could not be recorded");
  }
}

function requestMeta(request: Request, sessionId?: string) {
  void request;
  return { sessionId };
}
