"use client";

import { useEffect } from "react";

interface ProductViewTrackerProps {
  product: {
    productId?: string;
    productSlug?: string;
    productName: string;
    sku?: string;
    brand?: string;
    category?: string;
  };
}

interface CatalogSearchTrackerProps {
  searchTerm: string;
  resultCount: number;
  category?: string | undefined;
  group?: string | undefined;
  brand?: string | undefined;
}

const sessionStorageKey = "entasburada.analyticsSessionId";

export function ProductViewTracker({ product }: ProductViewTrackerProps) {
  useEffect(() => {
    const startedAt = Date.now();
    const timer = window.setTimeout(() => {
      postEvent("/api/events/product-view", {
        ...product,
        durationSeconds: Math.max(1, Math.round((Date.now() - startedAt) / 1000)),
        sessionId: getSessionId()
      });
    }, 1200);

    return () => window.clearTimeout(timer);
  }, [product.productSlug, product.productName, product.sku, product.brand, product.category]);

  return null;
}

export function CatalogSearchTracker({ searchTerm, resultCount, category, group, brand }: CatalogSearchTrackerProps) {
  useEffect(() => {
    const sessionId = getSessionId();
    if (searchTerm.trim()) {
      postEvent("/api/events/search", {
        eventKind: "search",
        searchTerm,
        resultCount,
        category: category || group,
        brand,
        sessionId
      });
    }

    const categoryName = category || group;
    if (categoryName) {
      postEvent("/api/events/search", {
        eventKind: "category_view",
        category: categoryName,
        resultCount,
        sessionId
      });
    }
  }, [searchTerm, resultCount, category, group, brand]);

  return null;
}

function postEvent(url: string, payload: Record<string, unknown>): void {
  const body = JSON.stringify(payload);
  if ("sendBeacon" in navigator) {
    const blob = new Blob([body], { type: "application/json" });
    navigator.sendBeacon(url, blob);
    return;
  }

  fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
    keepalive: true
  }).catch(() => undefined);
}

function getSessionId(): string {
  try {
    const existing = window.localStorage.getItem(sessionStorageKey);
    if (existing) {
      return existing;
    }

    const next = `web-${crypto.randomUUID()}`;
    window.localStorage.setItem(sessionStorageKey, next);
    return next;
  } catch {
    return `web-${Date.now()}`;
  }
}
