"use client";

import { useEffect } from "react";
import { clearQuoteBasket } from "./quote-basket";

// Teklif başarıyla gönderildiğinde sepet temizlenir (başarı sayfasında render edilir).
export function ClearQuoteBasket() {
  useEffect(() => {
    clearQuoteBasket();
  }, []);

  return null;
}
