export type AnalyticsEventName =
  | "product_viewed"
  | "search_performed"
  | "favorite_added"
  | "compare_added"
  | "quote_item_added"
  | "cart_item_added"
  | "checkout_abandoned";

export interface AnalyticsEventPayload {
  companyId?: string;
  userId?: string;
  productId?: string;
  categoryId?: string;
  searchQuery?: string;
  value?: number;
  metadata?: Record<string, string | number | boolean>;
}

export function buildAnalyticsEvent(name: AnalyticsEventName, payload: AnalyticsEventPayload) {
  return {
    name,
    payload,
    occurredAt: new Date().toISOString()
  };
}
