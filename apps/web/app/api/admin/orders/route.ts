import { getAdminEmail, isAdminAuthenticated } from "../../../../lib/admin-auth";
import { searchAdminOrders, updateOrderOperation, type OrderStatus } from "../../../../lib/commercial-repository";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  if (!(await isAdminAuthenticated())) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const limit = clampNumber(url.searchParams.get("limit"), 25, 1, 100);
  const page = clampNumber(url.searchParams.get("page"), 1, 1, 10000);
  const result = await searchAdminOrders({
    q: url.searchParams.get("q") ?? "",
    status: url.searchParams.get("status") ?? "all",
    company: url.searchParams.get("company") ?? "",
    financeApproval: url.searchParams.get("financeApproval") ?? "all",
    warehouse: url.searchParams.get("warehouse") ?? "all",
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
      orderId?: string;
      status?: OrderStatus;
      paymentStatus?: string;
      financeApproval?: string;
      stockStatus?: string;
      shipmentStatus?: string;
      warehouse?: string;
      internalNote?: string;
    };

    const order = await updateOrderOperation(
      {
        orderId: body.orderId ?? "",
        status: body.status,
        paymentStatus: body.paymentStatus,
        financeApproval: body.financeApproval,
        stockStatus: body.stockStatus,
        shipmentStatus: body.shipmentStatus,
        warehouse: body.warehouse,
        internalNote: body.internalNote
      },
      getAdminEmail()
    );

    return Response.json({ order });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Order action failed" }, { status: 400 });
  }
}

function clampNumber(value: string | null, fallback: number, min: number, max: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.min(Math.max(Math.trunc(parsed), min), max);
}
