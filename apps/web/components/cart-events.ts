export const CART_CHANGED_EVENT = "entas-cart-changed";

export interface CartChangedDetail {
  lineCount: number;
  totalQuantity: number;
}
