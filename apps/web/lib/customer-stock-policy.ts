import type { PublicCatalogProduct } from "@entas/catalog";

/**
 * Musteriye ham adet yerine gercek tedarikci durumunu ve guvenli stok araligini
 * gosterir. Tam adet public DTO'ya hic eklenmez; boylece stok dogrulugu ile ticari
 * gizlilik birlikte korunur.
 */
export function applyCustomerStockPolicy<T extends Pick<PublicCatalogProduct, "stockTone" | "stockLabel" | "stockQuantityKnown">>(product: T): T {
  return { ...product };
}
