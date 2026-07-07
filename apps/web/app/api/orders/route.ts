import { getOrderByTrackingCode } from "../../../lib/commercial-repository";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const code = url.searchParams.get("code") ?? "";
  const order = await getOrderByTrackingCode(code);

  if (!order) {
    return Response.json({ error: "Order not found" }, { status: 404 });
  }

  return Response.json({
    orderNo: order.orderNo,
    trackingCode: order.trackingCode,
    quoteNo: order.quoteNo,
    status: order.status,
    financeApproval: order.financeApproval,
    stockStatus: order.stockStatus,
    shipmentStatus: order.shipmentStatus,
    companyName: order.companyName,
    orderedAt: order.orderedAt,
    totalAmount: order.totalAmount,
    currency: order.currency,
    itemCount: order.items.length
  });
}
