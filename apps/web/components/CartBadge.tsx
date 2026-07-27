"use client";

import { useEffect, useState } from "react";
import { CART_CHANGED_EVENT, type CartChangedDetail } from "./cart-events";

export function CartBadge({ initialCount }: { initialCount: number }) {
  const [count, setCount] = useState(initialCount);

  useEffect(() => {
    const update = (event: Event) => {
      const detail = (event as CustomEvent<CartChangedDetail>).detail;
      if (detail && Number.isFinite(detail.lineCount)) setCount(detail.lineCount);
    };
    window.addEventListener(CART_CHANGED_EVENT, update);
    return () => window.removeEventListener(CART_CHANGED_EVENT, update);
  }, []);

  if (count <= 0) return null;
  return <span className="cartBadge">{count > 99 ? "99+" : count}</span>;
}
