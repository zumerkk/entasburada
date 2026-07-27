import "server-only";
import { clearCart, loadPricedCart, type CartSummary } from "./cart-repository";
import type { CustomerAccount } from "./customer-auth";
import { convertQuoteToOrder, createQuote, priceQuote, updateQuoteStatus, type AdminOrder, type AdminQuote } from "./commercial-repository";

export async function createQuoteFromCustomerCart(customer: CustomerAccount): Promise<AdminQuote> {
  const cart = await loadPricedCart(customer);
  const quote = await createQuoteFromCart(customer, cart);
  await clearCart(customer);
  return quote;
}

export async function createOrderFromCustomerCart(customer: CustomerAccount): Promise<AdminOrder> {
  const cart = await loadPricedCart(customer);
  if (!cart.canCreateOrder) {
    throw new Error(cart.orderBlockReason || "Sepet doğrudan siparişe uygun değil; teklif oluşturun.");
  }
  const quote = await createQuoteFromCart(customer, cart);
  await updateQuoteStatus(quote.id, "APPROVED", customer.authorizedPerson, "Bayi sepetten siparisi onayladi.");
  const order = await convertQuoteToOrder(quote.id, customer.authorizedPerson, "customer");
  await clearCart(customer);
  return order;
}

async function createQuoteFromCart(customer: CustomerAccount, cart: CartSummary): Promise<AdminQuote> {
  if (cart.items.length === 0) {
    throw new Error("Sepet bos.");
  }

  const quote = await createQuote({
    companyTitle: customer.companyName,
    authorizedPerson: customer.authorizedPerson,
    phone: customer.phone,
    email: customer.email,
    projectName: "Sepet / hizli siparis",
    deliveryCity: customer.city,
    deliveryAddress: customer.deliveryAddress,
    paymentPreference: "Cari hesap",
    notes: `${customer.segment} segmenti sepet akisi${cart.canCreateOrder ? "" : ` · ${cart.orderBlockReason ?? "Fiyat teyidi gerekli"}`}`,
    items: cart.items.map((item) => ({
      sku: item.sku,
      productName: item.productName,
      quantity: item.quantity,
      unit: item.unit,
      targetPrice: item.unitNetPrice
    }))
  });

  if (!cart.canCreateOrder) {
    return quote;
  }

  const priceBySku = new Map(cart.items.map((item) => [item.sku, item.unitNetPrice]));
  return priceQuote(
    {
      quoteId: quote.id,
      salesRepresentative: "Bayi fiyat motoru",
      internalNote: "Sepet/hizli siparis akisi otomatik fiyatlandirdi.",
      prices: quote.items.map((item) => ({
        itemId: item.id,
        quotedUnitPrice: priceBySku.get(item.sku) ?? item.targetPrice ?? "0"
      }))
    },
    "Bayi fiyat motoru"
  );
}
