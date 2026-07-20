"use client";

import { useEffect, useState } from "react";
import { Plus, X } from "lucide-react";
import { readQuoteBasket, removeFromQuoteBasket } from "./quote-basket";

interface LineState {
  key: string;
  sku: string;
  name: string;
  quantity: string;
  unit: string;
  fromBasket: boolean;
}

interface QuoteLinesProps {
  units: string[];
  initialSku?: string | undefined;
  initialName?: string | undefined;
  initialUnit?: string | undefined;
}

let keySeq = 0;
const nextKey = () => `line-${Date.now()}-${keySeq++}`;

function emptyLine(unit = "Adet"): LineState {
  return { key: nextKey(), sku: "", name: "", quantity: "", unit, fromBasket: false };
}

export function QuoteLines({ units, initialSku, initialName, initialUnit }: QuoteLinesProps) {
  // Sunucu render'ı: yalnızca URL'den gelen satır + boşlar (hydration uyumu için sepet mount'ta yüklenir)
  const [lines, setLines] = useState<LineState[]>(() => {
    const start: LineState[] = [];
    if (initialSku || initialName) {
      start.push({ key: "initial", sku: initialSku ?? "", name: initialName ?? "", quantity: "1", unit: initialUnit || "Adet", fromBasket: false });
    }
    while (start.length < 3) {
      start.push(emptyLine());
    }
    return start;
  });

  useEffect(() => {
    const basket = readQuoteBasket();
    if (basket.length === 0) {
      return;
    }
    setLines((current) => {
      const merged: LineState[] = [];
      const seen = new Set<string>();
      // 1) sepettekiler
      for (const item of basket) {
        merged.push({ key: `basket-${item.sku}`, sku: item.sku, name: item.name, quantity: String(item.quantity), unit: item.unit, fromBasket: true });
        seen.add(item.sku);
      }
      // 2) URL'den gelen (sepette yoksa)
      for (const line of current) {
        if ((line.sku || line.name) && !seen.has(line.sku)) {
          merged.push(line);
          seen.add(line.sku);
        }
      }
      // 3) en az bir boş satır
      merged.push(emptyLine());
      return merged;
    });
  }, []);

  const updateLine = (key: string, patch: Partial<LineState>) => {
    setLines((current) => current.map((line) => (line.key === key ? { ...line, ...patch } : line)));
  };

  const removeLine = (key: string) => {
    setLines((current) => {
      const target = current.find((line) => line.key === key);
      if (target?.fromBasket && target.sku) {
        removeFromQuoteBasket(target.sku);
      }
      const next = current.filter((line) => line.key !== key);
      return next.length > 0 ? next : [emptyLine()];
    });
  };

  const filled = lines.filter((line) => line.sku || line.name).length;

  return (
    <div className="quoteLines">
      {filled > 1 ? <p className="quoteLinesSummary">Sepetinizdeki {filled} ürün aşağıda listelendi. Kataloğa dönüp eklemeye devam edebilirsiniz; sepetiniz kaybolmaz.</p> : null}
      {lines.map((line) => (
        <div className={`quoteLine liveQuoteLine${line.fromBasket ? " fromBasket" : ""}`} key={line.key}>
          <input name="itemSku" placeholder="SKU veya barkod" value={line.sku} onChange={(e) => updateLine(line.key, { sku: e.target.value })} />
          <input name="itemName" placeholder="Ürün adı" value={line.name} onChange={(e) => updateLine(line.key, { name: e.target.value })} />
          <input
            name="itemQuantity"
            type="number"
            min="1"
            placeholder="Adet"
            value={line.quantity}
            onChange={(e) => updateLine(line.key, { quantity: e.target.value })}
          />
          <select name="itemUnit" value={line.unit} onChange={(e) => updateLine(line.key, { unit: e.target.value })}>
            {(units.includes(line.unit) ? units : [line.unit, ...units]).map((unit) => (
              <option value={unit} key={unit}>
                {unit}
              </option>
            ))}
          </select>
          <input name="itemTargetPrice" inputMode="decimal" placeholder="Hedef fiyat" />
          <input name="itemTargetDeliveryDate" type="date" aria-label="Satır teslimat tarihi" />
          <button className="quoteLineRemove" type="button" onClick={() => removeLine(line.key)} aria-label="Satırı kaldır" title="Satırı kaldır">
            <X size={15} aria-hidden="true" />
          </button>
        </div>
      ))}
      <button className="btn btnGhost dark quoteLineAdd" type="button" onClick={() => setLines((current) => [...current, emptyLine()])}>
        <Plus size={16} aria-hidden="true" />
        Satır Ekle
      </button>
    </div>
  );
}
