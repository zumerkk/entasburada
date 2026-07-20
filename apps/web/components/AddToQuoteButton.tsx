"use client";

import { useState } from "react";
import { Check, ShoppingCart } from "lucide-react";
import { addToQuoteBasket } from "./quote-basket";

export function AddToQuoteButton({ sku, name, unit }: { sku: string; name: string; unit: string }) {
  const [justAdded, setJustAdded] = useState(false);

  const handleAdd = () => {
    addToQuoteBasket({ sku, name, unit });
    setJustAdded(true);
    window.setTimeout(() => setJustAdded(false), 2600);
  };

  return (
    <div className="addToQuote">
      <button className={`btn btnPrimary${justAdded ? " added" : ""}`} type="button" onClick={handleAdd}>
        {justAdded ? <Check size={18} aria-hidden="true" /> : <ShoppingCart size={18} aria-hidden="true" />}
        {justAdded ? "Sepete Eklendi ✓" : "Sepete Ekle"}
      </button>
    </div>
  );
}
