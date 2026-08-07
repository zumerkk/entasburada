import { getOrderByTrackingCode } from "../../../lib/commercial-repository";
import { getCurrentCustomer } from "../../../lib/customer-auth";
import { canAccessCommercialRecord } from "../../../lib/commercial-access";
import { noStoreJson } from "../../../lib/security";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const code = url.searchParams.get("code") ?? "";
  const [order, customer] = await Promise.all([getOrderByTrackingCode(code), getCurrentCustomer()]);

  if (!order || !canAccessCommercialRecord(order, customer)) {
    return noStoreJson({ error: "Order not found" }, 404);
  }

  return noStoreJson({
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
