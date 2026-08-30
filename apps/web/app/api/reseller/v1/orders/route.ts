import { z } from "zod";
import { authorizeSellerRequest } from "../../../../../lib/reseller-api-auth";
import { createSellerOrder } from "../../../../../lib/reseller-order";
import { consumeRateLimit } from "../../../../../lib/rate-limit";
import { readJsonBody, requestErrorResponse } from "../../../../../lib/security";

export const dynamic = "force-dynamic";

const schema = z.object({
  externalOrderId: z.string().trim().min(2).max(100),
  recipient: z.object({
    name: z.string().trim().min(2).max(140),
    phone: z.string().trim().min(10).max(32),
    city: z.string().trim().min(2).max(100),
    address: z.string().trim().min(10).max(600)
  }).strict(),
  note: z.string().trim().max(2_000).optional(),
  blindShipping: z.boolean().default(false),
  items: z.array(z.object({
    sku: z.string().trim().min(1).max(160),
    quantity: z.number().int().min(1).max(999_999)
  }).strict()).min(1).max(50)
}).strict();

export async function POST(request: Request): Promise<Response> {
  const seller = await authorizeSellerRequest(request, "orders");
  if (!seller) return noStoreJson({ error: "Sipariş API yetkisi olan geçerli satıcı anahtarı gerekli." }, 401);
  if (seller.authType !== "api_key") return noStoreJson({ error: "Bu uç nokta Bearer API anahtarı ile kullanılmalıdır." }, 401);

  const rate = await consumeRateLimit("reseller-orders-api", seller.customer.id, { limit: 30, windowMs: 60_000 });
  if (!rate.allowed) return noStoreJson({ error: "Sipariş istek sınırı aşıldı. Bir dakika sonra tekrar deneyin." }, 429);

  try {
    const parsed = schema.safeParse(await readJsonBody<unknown>(request, 128 * 1024));
    if (!parsed.success) return noStoreJson({ error: "Geçersiz sipariş verisi.", issues: parsed.error.flatten() }, 400);
    const result = await createSellerOrder(seller.customer, {
      externalOrderId: parsed.data.externalOrderId,
      recipientName: parsed.data.recipient.name,
      recipientPhone: parsed.data.recipient.phone,
      deliveryCity: parsed.data.recipient.city,
      deliveryAddress: parsed.data.recipient.address,
      blindShipping: parsed.data.blindShipping,
      ...(parsed.data.note ? { note: parsed.data.note } : {}),
      items: parsed.data.items
    });
    return noStoreJson({
      created: result.created,
      orderNo: result.order.orderNo,
      trackingCode: result.order.trackingCode,
      externalOrderId: result.order.sellerOrderReference,
      status: result.order.status,
      totalAmount: result.order.totalAmount,
      currency: result.order.currency,
      trackingUrl: `/orders/${encodeURIComponent(result.order.trackingCode)}`
    }, result.created ? 201 : 200);
  } catch (error) {
    return requestErrorResponse(error, "Satıcı siparişi oluşturulamadı.");
  }
}

function noStoreJson(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: { "Cache-Control": "private, no-store", Vary: "Authorization" } });
}
