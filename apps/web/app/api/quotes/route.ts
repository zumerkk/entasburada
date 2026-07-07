import { createQuote, getQuoteByTrackingCode, type CreateQuoteInput } from "../../../lib/commercial-repository";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const code = url.searchParams.get("code") ?? "";
  const quote = await getQuoteByTrackingCode(code);

  if (!quote) {
    return Response.json({ error: "Quote not found" }, { status: 404 });
  }

  return Response.json({
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
  try {
    const body = (await request.json()) as CreateQuoteInput;
    const quote = await createQuote(body);
    return Response.json(
      {
        quoteNo: quote.quoteNo,
        trackingCode: quote.trackingCode,
        status: quote.status,
        detailUrl: `/quote/${encodeURIComponent(quote.trackingCode)}`
      },
      { status: 201 }
    );
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Quote could not be created" }, { status: 400 });
  }
}
