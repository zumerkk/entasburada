import { createQuote, getQuoteByTrackingCode, type CreateQuoteInput } from "../../../lib/commercial-repository";
import { getCurrentCustomer } from "../../../lib/customer-auth";
import { canAccessCommercialRecord } from "../../../lib/commercial-access";
import { noStoreJson, requestErrorResponse, trustedMutationError } from "../../../lib/security";
import { readJsonBody, getClientAddress } from "../../../lib/security";
import { consumeRateLimit } from "../../../lib/rate-limit";
import { z } from "zod";

export const dynamic = "force-dynamic";

const quoteSchema = z.object({
  companyTitle: z.string().trim().min(2).max(180),
  authorizedPerson: z.string().trim().min(2).max(120),
  phone: z.string().trim().min(10).max(32),
  email: z.string().trim().email().max(254),
  projectName: z.string().trim().max(160).optional(),
  projectCode: z.string().trim().max(80).optional(),
  deliveryCity: z.string().trim().max(100).optional(),
  deliveryAddress: z.string().trim().max(600).optional(),
  paymentPreference: z.string().trim().max(80).optional(),
  notes: z.string().trim().max(2_000).optional(),
  items: z.array(z.object({
    sku: z.string().trim().max(160).optional(),
    productName: z.string().trim().max(300).optional(),
    quantity: z.coerce.number().int().min(1).max(999_999),
    unit: z.string().trim().max(40).optional(),
    targetPrice: z.string().trim().max(40).optional(),
    targetDeliveryDate: z.string().trim().max(40).optional()
  }).refine((item) => Boolean(item.sku || item.productName), "Ürün kodu veya adı zorunludur.")).min(1).max(200)
}).strict();

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const code = url.searchParams.get("code") ?? "";
  const [quote, customer] = await Promise.all([getQuoteByTrackingCode(code), getCurrentCustomer()]);

  if (!quote || !canAccessCommercialRecord(quote, customer)) {
    return noStoreJson({ error: "Quote not found" }, 404);
  }

  return noStoreJson({
    quoteNo: quote.quoteNo,
    trackingCode: quote.trackingCode,
    status: quote.status,
    companyName: quote.companyName,
    requestedAt: quote.requestedAt,
    totalAmount: quote.totalAmount,
    currency: quote.currency,
    itemCount: quote.items.length
  });
}

export async function POST(request: Request): Promise<Response> {
  const originError = trustedMutationError(request);
  if (originError) return originError;
  try {
    const rateLimit = await consumeRateLimit("public-quote", getClientAddress(request.headers), { limit: 10, windowMs: 60 * 60 * 1000 });
    if (!rateLimit.allowed) return noStoreJson({ error: "Çok fazla teklif isteği gönderildi." }, 429);
    const parsed = quoteSchema.safeParse(await readJsonBody<unknown>(request, 256 * 1024));
    if (!parsed.success) return noStoreJson({ error: "Teklif bilgileri geçersiz.", issues: parsed.error.flatten() }, 400);
    const quote = await createQuote(parsed.data as CreateQuoteInput);
    return noStoreJson(
      {
        quoteNo: quote.quoteNo,
        trackingCode: quote.trackingCode,
        status: quote.status,
        detailUrl: `/quote/${encodeURIComponent(quote.trackingCode)}`
      },
      201
    );
  } catch (error) {
    return requestErrorResponse(error, "Quote could not be created");
  }
}
