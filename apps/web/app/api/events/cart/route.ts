import { z } from "zod";
import { trackCartEvent } from "../../../../lib/analytics-repository";
import { getCurrentCustomer } from "../../../../lib/customer-auth";
import { consumeRateLimit } from "../../../../lib/rate-limit";
import { readJsonBody, requestErrorResponse } from "../../../../lib/security";

export const dynamic = "force-dynamic";

const schema = z.object({
  type: z.enum(["cart_add", "cart_remove", "cart_clear", "quote_intent", "order_create"]),
  productName: z.string().trim().max(300).optional(),
  sku: z.string().trim().max(120).optional(),
  brand: z.string().trim().max(160).optional(),
  category: z.string().trim().max(240).optional(),
  quantity: z.coerce.number().min(0).max(100000).optional(),
  unit: z.string().trim().max(40).optional(),
  cartTotal: z.string().trim().max(80).optional(),
  sessionId: z.string().trim().max(120).optional()
}).strict();

export async function POST(request: Request): Promise<Response> {
  const customer = await getCurrentCustomer();
  if (!customer) {
    return Response.json({ error: "Customer login required" }, { status: 401 });
  }

  try {
    const limit = await consumeRateLimit("event-cart", customer.id, { limit: 120, windowMs: 60_000 });
    if (!limit.allowed) {
      return Response.json({ error: "Too many events" }, { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } });
    }
    const parsed = schema.safeParse(await readJsonBody<unknown>(request, 16 * 1024));
    if (!parsed.success) return Response.json({ error: "Invalid cart event" }, { status: 400 });

    const { type, sessionId, ...event } = parsed.data;
    await trackCartEvent(customer, type, event, requestMeta(request, sessionId));
    return Response.json({ ok: true }, { status: 201 });
  } catch (error) {
    return requestErrorResponse(error, "Cart event could not be recorded");
  }
}

function requestMeta(request: Request, sessionId?: string) {
  void request;
  return { sessionId };
}
