import { searchCatalogRecords } from "@entas/catalog";
import { isAdminAuthenticated } from "../../../../lib/admin-auth";
import type { AdminOrderProductOption } from "../../../../lib/admin-order-types";
import { loadCatalogStore, toCustomerFacingProduct } from "../../../../lib/catalog-repository";
import { getAdminOrderById } from "../../../../lib/commercial-repository";
import { findCustomerByEmail, getCustomers, type CustomerAccount } from "../../../../lib/customer-auth";
import { parseMoney, priceProductForCustomer } from "../../../../lib/customer-pricing";
import { noStoreJson } from "../../../../lib/security";

export const dynamic = "force-dynamic";

/**
 * Admin sipariş oluşturma/düzeltme ekranı için ürün arama.
 * Fiyat, siparişin açılacağı bayinin fiyat motoruyla hesaplanır (sunucu kaydederken yeniden hesaplar).
 */
export async function GET(request: Request): Promise<Response> {
  if (!(await isAdminAuthenticated())) {
    return noStoreJson({ error: "Unauthorized" }, 401);
  }

  const url = new URL(request.url);
  const q = (url.searchParams.get("q") ?? "").trim().slice(0, 120);
  if (q.length < 2) return noStoreJson({ items: [] });

  const customer = await resolvePricingCustomer(url.searchParams.get("customerId"), url.searchParams.get("orderId"));
  const store = await loadCatalogStore();
  const result = searchCatalogRecords(store, { q, publicOnly: true, stockStatus: "all", limit: 20 });
  const items: AdminOrderProductOption[] = result.items.map((product) => {
    const publicProduct = toCustomerFacingProduct(product);
    const price = priceProductForCustomer(product, customer);
    return {
      id: product.id,
      sku: product.sku,
      name: product.name,
      brand: product.brand,
      image: publicProduct.image,
      unit: product.unitType || "Adet",
      minOrder: publicProduct.minOrder,
      cartonQuantity: publicProduct.cartonQuantity,
      stockLabel: publicProduct.stockLabel,
      currency: product.currency === "TL" ? "TRY" : product.currency || "TRY",
      unitPrice: price ? parseMoney(price.unitNetPrice) : null,
      displayPrice: price?.displayPrice ?? "Fiyat yok",
      priceNote: price ? `${price.ruleLabel} · KDV dahil` : "Bu ürün teklifle fiyatlandırılmalı"
    };
  });

  return noStoreJson({ items });
}

async function resolvePricingCustomer(customerId: string | null, orderId: string | null): Promise<CustomerAccount> {
  let customer: CustomerAccount | null = null;
  if (customerId) {
    customer = (await getCustomers()).find((entry) => entry.id === customerId) ?? null;
  } else if (orderId) {
    const order = await getAdminOrderById(orderId);
    customer = order ? await findCustomerByEmail(order.email) : null;
  }
  // Hesabı olmayan/askıdaki müşteride sunucu da standart onaylı bayi fiyatını kullanır.
  return customer ? { ...customer, status: "approved" } : ({ status: "approved", segment: "standard" } as unknown as CustomerAccount);
}
