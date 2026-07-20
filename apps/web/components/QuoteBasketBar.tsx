"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { ArrowRight, ShoppingCart } from "lucide-react";
import { QUOTE_BASKET_EVENT, quoteBasketCount } from "./quote-basket";

// Her sayfada gorunen sabit teklif sepeti cubugu: urun ekledikce birikir,
// "Teklif Olustur" tek butonuyla forma gider.
export function QuoteBasketBar() {
  const [count, setCount] = useState(0);
  const pathname = usePathname();

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

  if (count === 0 || pathname.startsWith("/quote") || pathname.startsWith("/admin")) {
    return null;
  }

  return (
    <div className="quoteBasketBar" role="region" aria-label="Teklif sepeti">
      <span className="quoteBasketBarInfo">
        <ShoppingCart size={19} aria-hidden="true" />
        Teklif sepetinde <strong>{count} ürün</strong> var
      </span>
      <a className="btn btnPrimary" href="/quote">
        Teklif Oluştur
        <ArrowRight size={17} aria-hidden="true" />
      </a>
    </div>
  );
}
