"use client";

import { useState } from "react";
import { Minus, Plus } from "lucide-react";

export function CartQuantityField({ name, initialValue, minOrder, unit }: { name: string; initialValue: number; minOrder: number; unit: string }) {
  const minimum = Math.max(1, Math.trunc(minOrder) || 1);
  const [quantity, setQuantity] = useState(Math.max(minimum, Math.trunc(initialValue) || minimum));
  const update = (next: number) => setQuantity(Math.min(999_999, Math.max(minimum, Math.trunc(next) || minimum)));

  return (
    <div className="cartQuantityField">
      <button type="button" onClick={() => update(quantity - 1)} disabled={quantity <= minimum} aria-label="Miktarı azalt" title="Miktarı azalt">
        <Minus size={14} aria-hidden="true" />
      </button>
      <input name={name} type="number" min={minimum} max="999999" value={quantity} onChange={(event) => update(Number(event.target.value))} aria-label="Sepet miktarı" />
      <button type="button" onClick={() => update(quantity + 1)} disabled={quantity >= 999_999} aria-label="Miktarı artır" title="Miktarı artır">
        <Plus size={14} aria-hidden="true" />
      </button>
      <small>{unit}</small>
    </div>
  );
}
