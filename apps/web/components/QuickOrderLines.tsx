"use client";

import { useState } from "react";

interface QuickOrderLine {
  productSlug: string;
  sku: string;
  name: string;
  quantity: string;
  unit: string;
}

export function QuickOrderLines({ initialSku, initialName, initialProductSlug, initialUnit, units }: {
  initialSku: string;
  initialName: string;
  initialProductSlug: string;
  initialUnit: string;
  units: string[];
}) {
  const [lines, setLines] = useState<QuickOrderLine[]>(() => Array.from({ length: 10 }, (_, index) => ({
    productSlug: index === 0 ? initialProductSlug : "",
    sku: index === 0 ? initialSku : "",
    name: index === 0 ? initialName : "",
    quantity: index === 0 && (initialSku || initialName) ? "1" : "",
    unit: index === 0 && initialUnit ? initialUnit : "Adet"
  })));

  function updateLine(index: number, patch: Partial<QuickOrderLine>, changesProduct = false) {
    setLines((current) => current.map((line, lineIndex) => lineIndex === index
      ? { ...line, ...patch, ...(changesProduct ? { productSlug: "" } : {}) }
      : line));
  }

  return (
    <div className="quoteLines">
      {lines.map((line, index) => (
        <div className="quoteLine quickOrderLine" key={index}>
          <input type="hidden" name="itemProductSlug" value={line.productSlug} />
          <input name="itemSku" placeholder="SKU veya barkod" value={line.sku} onChange={(event) => updateLine(index, { sku: event.target.value }, true)} />
          <input name="itemName" placeholder="Ürün adı" value={line.name} onChange={(event) => updateLine(index, { name: event.target.value }, true)} />
          <input name="itemQuantity" type="number" min="1" placeholder="Adet" value={line.quantity} onChange={(event) => updateLine(index, { quantity: event.target.value })} />
          <select name="itemUnit" value={line.unit} onChange={(event) => updateLine(index, { unit: event.target.value })}>
            {(units.includes(line.unit) ? units : [line.unit, ...units]).map((unit) => <option value={unit} key={unit}>{unit}</option>)}
          </select>
        </div>
      ))}
    </div>
  );
}
