import { z } from "zod";
import { getCurrentCustomer } from "../../../../lib/customer-auth";
import { trackProductViewEvent } from "../../../../lib/analytics-repository";

export const dynamic = "force-dynamic";

const schema = z.object({
  productId: z.string().optional(),
  productSlug: z.string().optional(),
  productName: z.string().min(1),
  sku: z.string().optional(),
  brand: z.string().optional(),
  category: z.string().optional(),
  durationSeconds: z.coerce.number().min(0).max(3600).optional(),
  sessionId: z.string().max(120).optional()
});

export async function POST(request: Request): Promise<Response> {
  const parsed = schema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return Response.json({ error: "Invalid product view event" }, { status: 400 });
  }

  const customer = await getCurrentCustomer();
  await trackProductViewEvent(customer, parsed.data, requestMeta(request, parsed.data.sessionId));
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
