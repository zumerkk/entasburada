"use client";

import { useEffect, useState } from "react";
import { QUOTE_BASKET_EVENT, quoteBasketCount } from "./quote-basket";

export function QuoteBadge() {
  const [count, setCount] = useState(0);

  useEffect(() => {
    const update = () => setCount(quoteBasketCount());
    update();
    window.addEventListener(QUOTE_BASKET_EVENT, update);
    window.addEventListener("storage", update);
    return () => {
      window.removeEventListener(QUOTE_BASKET_EVENT, update);
      window.removeEventListener("storage", update);
    };
  }, []);

  if (count === 0) {
    return null;
  }

  return <span className="quoteBadge">{count > 99 ? "99+" : count}</span>;
}
