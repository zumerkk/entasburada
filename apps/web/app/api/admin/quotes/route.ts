import { getAdminEmail, isAdminAuthenticated } from "../../../../lib/admin-auth";
import { convertQuoteToOrder, priceQuote, searchAdminQuotes, updateQuoteStatus, type QuoteStatus } from "../../../../lib/commercial-repository";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  if (!(await isAdminAuthenticated())) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const limit = clampNumber(url.searchParams.get("limit"), 25, 1, 100);
  const page = clampNumber(url.searchParams.get("page"), 1, 1, 10000);
  const result = await searchAdminQuotes({
    q: url.searchParams.get("q") ?? "",
    status: url.searchParams.get("status") ?? "all",
    company: url.searchParams.get("company") ?? "",
    salesRepresentative: url.searchParams.get("salesRepresentative") ?? "",
    dateFrom: url.searchParams.get("dateFrom") ?? "",
    dateTo: url.searchParams.get("dateTo") ?? "",
    limit,
    offset: (page - 1) * limit
  });

  return Response.json(result);
}

export async function POST(request: Request): Promise<Response> {
  if (!(await isAdminAuthenticated())) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = (await request.json()) as {
      action?: string;
      quoteId?: string;
      status?: QuoteStatus;
      validUntil?: string;
      salesRepresentative?: string;
      internalNote?: string;
      prices?: Array<{ itemId: string; quotedUnitPrice: string }>;
    };

    if (body.action === "price") {
      const quote = await priceQuote(
        {
          quoteId: body.quoteId ?? "",
          validUntil: body.validUntil,
          salesRepresentative: body.salesRepresentative,
          internalNote: body.internalNote,
          prices: body.prices ?? []
        },
        getAdminEmail()
      );
      return Response.json({ quote });
    }

    if (body.action === "convert") {
      const order = await convertQuoteToOrder(body.quoteId ?? "", getAdminEmail());
      return Response.json({ order }, { status: 201 });
    }

    if (body.action === "status" && body.status) {
      const quote = await updateQuoteStatus(body.quoteId ?? "", body.status, getAdminEmail());
      return Response.json({ quote });
    }

    return Response.json({ error: "Unsupported action" }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Quote action failed" }, { status: 400 });
  }
}

function clampNumber(value: string | null, fallback: number, min: number, max: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.min(Math.max(Math.trunc(parsed), min), max);
}
