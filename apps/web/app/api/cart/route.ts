import { z } from "zod";
import { addCartItems, CartInputError, clearCart, loadPricedCart } from "../../../lib/cart-repository";
import { trackCartEvent } from "../../../lib/analytics-repository";
import { getCurrentCustomer } from "../../../lib/customer-auth";

export const dynamic = "force-dynamic";

const cartItemSchema = z.object({
  sku: z.string().trim().min(1).max(160),
  productName: z.string().trim().max(300).optional(),
  quantity: z.number().int().min(1).max(999_999),
  unit: z.string().trim().max(40).optional()
}).strict();

const cartBodySchema = z.union([
  z.object({ clear: z.literal(true) }).strict(),
  z.object({ items: z.array(cartItemSchema).min(1).max(50) }).strict()
]);

export async function GET(): Promise<Response> {
  const customer = await getCurrentCustomer();
  if (!customer) {
    return Response.json({ error: "Customer login required" }, { status: 401 });
  }

  const cart = await loadPricedCart(customer);
  return noStoreJson({ cart });
}

export async function POST(request: Request): Promise<Response> {
  const customer = await getCurrentCustomer();
  if (!customer) {
    return Response.json({ error: "Customer login required" }, { status: 401 });
  }

  const rawBody = await request.json().catch(() => null);
  const parsed = cartBodySchema.safeParse(rawBody);
  if (!parsed.success) {
    return noStoreJson({ error: "Geçerli bir ürün ve miktar gönderin." }, 400);
  }

  if ("clear" in parsed.data) {
    await clearCart(customer);
    await trackCartEvent(customer, "cart_clear");
    return noStoreJson({ cart: await loadPricedCart(customer) });
  }

  try {
    const items = parsed.data.items;
    await addCartItems(customer, items, { catalogOnly: true });
    await Promise.all(items.map((item) => trackCartEvent(customer, "cart_add", { productName: item.productName, sku: item.sku, quantity: item.quantity, unit: item.unit })));
    return noStoreJson({ cart: await loadPricedCart(customer) }, 201);
  } catch (error) {
    const message = error instanceof CartInputError ? error.message : "Ürün sepete eklenemedi.";
    return noStoreJson({ error: message }, error instanceof CartInputError ? 400 : 500);
  }
}

function noStoreJson(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}
