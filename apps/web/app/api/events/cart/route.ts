import { z } from "zod";
import { trackCartEvent } from "../../../../lib/analytics-repository";
import { getCurrentCustomer } from "../../../../lib/customer-auth";

export const dynamic = "force-dynamic";

const schema = z.object({
  type: z.enum(["cart_add", "cart_remove", "cart_clear", "quote_intent", "order_create"]),
  productName: z.string().optional(),
  sku: z.string().optional(),
  brand: z.string().optional(),
  category: z.string().optional(),
  quantity: z.coerce.number().min(0).max(100000).optional(),
  unit: z.string().optional(),
  cartTotal: z.string().optional(),
  sessionId: z.string().max(120).optional()
});

export async function POST(request: Request): Promise<Response> {
  const customer = await getCurrentCustomer();
  if (!customer) {
    return Response.json({ error: "Customer login required" }, { status: 401 });
  }

  const parsed = schema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return Response.json({ error: "Invalid cart event" }, { status: 400 });
  }

  const { type, sessionId, ...event } = parsed.data;
  await trackCartEvent(customer, type, event, requestMeta(request, sessionId));
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
