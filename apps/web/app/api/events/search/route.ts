import { z } from "zod";
import { trackCategoryViewEvent, trackSearchEvent } from "../../../../lib/analytics-repository";
import { getCurrentCustomer } from "../../../../lib/customer-auth";

export const dynamic = "force-dynamic";

const schema = z.object({
  searchTerm: z.string().optional().default(""),
  resultCount: z.coerce.number().min(0).max(100000).default(0),
  category: z.string().optional().default(""),
  brand: z.string().optional().default(""),
  eventKind: z.enum(["search", "category_view"]).default("search"),
  sessionId: z.string().max(120).optional()
});

export async function POST(request: Request): Promise<Response> {
  const parsed = schema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return Response.json({ error: "Invalid search event" }, { status: 400 });
  }

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
}

function requestMeta(request: Request, sessionId?: string) {
  return {
    sessionId,
    device: request.headers.get("user-agent") ?? "",
    ip: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "",
    referrer: request.headers.get("referer") ?? ""
  };
}
