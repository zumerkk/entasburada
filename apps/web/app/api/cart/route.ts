import { addCartItems, clearCart, loadPricedCart, type CartItemInput } from "../../../lib/cart-repository";
import { getCurrentCustomer } from "../../../lib/customer-auth";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const customer = await getCurrentCustomer();
  if (!customer) {
    return Response.json({ error: "Customer login required" }, { status: 401 });
  }

  const cart = await loadPricedCart(customer);
  return Response.json({ cart });
}

export async function POST(request: Request): Promise<Response> {
  const customer = await getCurrentCustomer();
  if (!customer) {
    return Response.json({ error: "Customer login required" }, { status: 401 });
  }

  const body = (await request.json()) as { items?: CartItemInput[]; clear?: boolean };
  if (body.clear) {
    await clearCart(customer);
    return Response.json({ cart: await loadPricedCart(customer) });
  }

  await addCartItems(customer, body.items ?? []);
  return Response.json({ cart: await loadPricedCart(customer) }, { status: 201 });
}
