"use client";

import { useState } from "react";
import { Check, FilePlus2 } from "lucide-react";
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
      <button className={`btn btnSecondary${justAdded ? " added" : ""}`} type="button" onClick={handleAdd}>
        {justAdded ? <Check size={18} aria-hidden="true" /> : <FilePlus2 size={18} aria-hidden="true" />}
        {justAdded ? "Teklif Listesine Eklendi" : "Teklif Listesine Ekle"}
      </button>
    </div>
  );
}
