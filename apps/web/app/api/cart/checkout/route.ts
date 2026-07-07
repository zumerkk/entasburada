import { createOrderFromCustomerCart, createQuoteFromCustomerCart } from "../../../../lib/cart-checkout";
import { getCurrentCustomer } from "../../../../lib/customer-auth";

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  const customer = await getCurrentCustomer();
  if (!customer) {
    return Response.json({ error: "Customer login required" }, { status: 401 });
  }

  try {
    const body = (await request.json()) as { mode?: "quote" | "order" };
    if (body.mode === "order") {
      const order = await createOrderFromCustomerCart(customer);
      return Response.json({ orderNo: order.orderNo, trackingCode: order.trackingCode, status: order.status, href: `/orders/${order.trackingCode}` }, { status: 201 });
    }

    const quote = await createQuoteFromCustomerCart(customer);
    return Response.json({ quoteNo: quote.quoteNo, trackingCode: quote.trackingCode, status: quote.status, href: `/quote/${quote.trackingCode}` }, { status: 201 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Cart checkout failed" }, { status: 400 });
  }
}
