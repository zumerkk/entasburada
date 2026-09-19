/** Safe browser-facing data; prices and orders are only populated for the signed-in customer. */
export interface EnexProduct {
  slug: string;
  sku: string;
  name: string;
  brand: string;
  image?: string;
  unit: string;
  minOrder: number;
  price?: string;
  stockLabel: string;
  available: boolean;
}

export interface EnexOrderItem {
  productSlug: string;
  sku: string;
  productName: string;
  unit: string;
  quantity: number;
  minOrder?: number;
  available?: boolean;
}

export interface EnexOrder {
  id: string;
  number: string;
  date: string;
  status: string;
  items: EnexOrderItem[];
}

export interface EnexLink { label: string; href: string }
export interface EnexCartSummary {
  itemCount: number;
  subtotal: string;
  total: string;
  freeShippingRemaining: string;
  freeShipping: boolean;
  unavailableCount: number;
}

export interface EnexContextResponse {
  authenticated: boolean;
  sessionScope: string;
  customerName?: string;
  mode: "openai" | "catalog";
  products: EnexProduct[];
  orders: EnexOrder[];
  suggestions: string[];
  links: EnexLink[];
  cart?: EnexCartSummary;
}

export interface EnexChatMessage { role: "user" | "assistant"; content: string }
export interface EnexChatRequest {
  messages: EnexChatMessage[];
  context: { pathname: string; productSlug?: string | undefined };
}
export interface EnexChatResponse {
  reply: string;
  mode: "openai" | "catalog";
  products: EnexProduct[];
  orders: EnexOrder[];
  suggestions: string[];
  links: EnexLink[];
}
