import { z } from "zod";
import { getCurrentCustomer } from "../../../../lib/customer-auth";
import { trackProductViewEvent } from "../../../../lib/analytics-repository";
import { consumeRateLimit } from "../../../../lib/rate-limit";
import { getClientAddress, readJsonBody, requestErrorResponse } from "../../../../lib/security";

export const dynamic = "force-dynamic";

const schema = z.object({
  productId: z.string().trim().max(120).optional(),
  productSlug: z.string().trim().max(240).optional(),
  productName: z.string().trim().min(1).max(300),
  sku: z.string().trim().max(120).optional(),
  brand: z.string().trim().max(160).optional(),
  category: z.string().trim().max(240).optional(),
  durationSeconds: z.coerce.number().min(0).max(3600).optional(),
  sessionId: z.string().trim().max(120).optional()
}).strict();

export async function POST(request: Request): Promise<Response> {
  try {
    const limit = await consumeRateLimit("event-product-view", getClientAddress(request.headers), { limit: 120, windowMs: 60_000 });
    if (!limit.allowed) {
      return Response.json({ error: "Too many events" }, { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } });
    }
    const parsed = schema.safeParse(await readJsonBody<unknown>(request, 16 * 1024));
    if (!parsed.success) return Response.json({ error: "Invalid product view event" }, { status: 400 });

    const customer = await getCurrentCustomer();
    await trackProductViewEvent(customer, parsed.data, requestMeta(request, parsed.data.sessionId));
    return Response.json({ ok: true }, { status: 201 });
  } catch (error) {
    return requestErrorResponse(error, "Product view event could not be recorded");
  }
}

function requestMeta(request: Request, sessionId?: string) {
  void request;
  return { sessionId };
}
