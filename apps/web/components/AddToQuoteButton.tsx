"use client";

import { useEffect, useState } from "react";
import { Check, FileText } from "lucide-react";
import { addToQuoteBasket, quoteBasketCount } from "./quote-basket";

export function AddToQuoteButton({ sku, name, unit }: { sku: string; name: string; unit: string }) {
  const [count, setCount] = useState(0);
  const [justAdded, setJustAdded] = useState(false);

  useEffect(() => {
    setCount(quoteBasketCount());
  }, []);

  const handleAdd = () => {
    const items = addToQuoteBasket({ sku, name, unit });
    setCount(items.length);
    setJustAdded(true);
    window.setTimeout(() => setJustAdded(false), 2600);
  };

  return (
    <div className="addToQuote">
      <button className={`btn btnPrimary${justAdded ? " added" : ""}`} type="button" onClick={handleAdd}>
        {justAdded ? <Check size={18} aria-hidden="true" /> : <FileText size={18} aria-hidden="true" />}
        {justAdded ? "Teklif Listesine Eklendi" : "Teklif Listesine Ekle"}
      </button>
      {count > 0 ? (
        <a className="addToQuoteLink" href="/quote">
          Teklif listende {count} ürün var — Teklifi Tamamla →
        </a>
      ) : null}
    </div>
  );
}
