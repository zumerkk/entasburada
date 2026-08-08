import type { PublicCatalogProduct } from "@entas/catalog";

export const CUSTOMER_STOCK_LABEL = "Stokta var";

type CustomerStockView<T> = Omit<T, "stockTone" | "stockLabel" | "stockQuantityKnown"> & {
  stockTone: "in_stock";
  stockLabel: typeof CUSTOMER_STOCK_LABEL;
  stockQuantityKnown: true;
};

export function applyCustomerStockPolicy<T extends Pick<PublicCatalogProduct, "stockTone" | "stockLabel" | "stockQuantityKnown">>(product: T): CustomerStockView<T> {
  return {
    ...product,
    stockTone: "in_stock",
    stockLabel: CUSTOMER_STOCK_LABEL,
    stockQuantityKnown: true
  } as CustomerStockView<T>;
}
