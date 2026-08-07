import { getAdminEmail, isAdminAuthenticated } from "../../../../lib/admin-auth";
import { searchAdminOrders, updateOrderOperation, type OrderStatus } from "../../../../lib/commercial-repository";
import { z } from "zod";
import { readJsonBody, requestErrorResponse } from "../../../../lib/security";

export const dynamic = "force-dynamic";

const orderMutationSchema = z.object({
  orderId: z.string().trim().min(1).max(160),
  status: z.enum(["DRAFT", "PAYMENT_PENDING", "APPROVAL_PENDING", "FINANCE_APPROVAL_PENDING", "STOCK_WAITING", "PREPARING", "READY_TO_SHIP", "SHIPPED", "DELIVERED", "CANCELLED", "COMPLETED"]).optional(),
  paymentStatus: z.string().trim().max(160).optional(),
  financeApproval: z.string().trim().max(160).optional(),
  stockStatus: z.string().trim().max(160).optional(),
  shipmentStatus: z.string().trim().max(160).optional(),
  warehouse: z.string().trim().max(160).optional(),
  internalNote: z.string().trim().max(2_000).optional()
}).strict();

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
    const parsed = orderMutationSchema.safeParse(await readJsonBody<unknown>(request));
    if (!parsed.success) return Response.json({ error: "Geçersiz sipariş güncellemesi.", issues: parsed.error.flatten() }, { status: 400 });
    const body = parsed.data;

    const order = await updateOrderOperation(
      {
        orderId: body.orderId,
        status: body.status as OrderStatus | undefined,
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
    return requestErrorResponse(error, "Order action failed");
  }
}

function clampNumber(value: string | null, fallback: number, min: number, max: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.min(Math.max(Math.trunc(parsed), min), max);
}
