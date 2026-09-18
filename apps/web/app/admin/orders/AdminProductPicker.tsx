"use client";

import { useEffect, useRef, useState } from "react";
import { LoaderCircle, Plus, Search } from "lucide-react";
import type { AdminOrderProductOption } from "../../../lib/admin-order-types";

interface AdminProductPickerProps {
  /** Fiyat bu bayiye göre hesaplanır. */
  customerId?: string;
  /** Mevcut sipariş düzeltilirken fiyat siparişin müşterisine göre hesaplanır. */
  orderId?: string;
  disabled?: boolean;
  disabledHint?: string;
  onAdd: (product: AdminOrderProductOption) => void;
}

/** SKU, ürün adı veya marka ile arar; seçili bayinin KDV dahil fiyatını gösterir. */
export function AdminProductPicker({ customerId, orderId, disabled = false, disabledHint, onAdd }: AdminProductPickerProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<AdminOrderProductOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [lastAdded, setLastAdded] = useState("");
  const requestId = useRef(0);

  useEffect(() => {
    const term = query.trim();
    if (disabled || term.length < 2) {
      setResults([]);
      setLoading(false);
      return;
    }
    const current = ++requestId.current;
    const timer = window.setTimeout(async () => {
      setLoading(true);
      setError("");
      try {
        const params = new URLSearchParams({ q: term });
        if (customerId) params.set("customerId", customerId);
        if (orderId) params.set("orderId", orderId);
        const response = await fetch(`/api/admin/order-products?${params.toString()}`, { cache: "no-store" });
        const payload = (await response.json()) as { items?: AdminOrderProductOption[]; error?: string };
        if (current !== requestId.current) return;
        if (!response.ok) throw new Error(payload.error || "Ürünler aranamadı.");
        setResults(payload.items ?? []);
      } catch (reason) {
        if (current === requestId.current) setError(reason instanceof Error ? reason.message : "Ürünler aranamadı.");
      } finally {
        if (current === requestId.current) setLoading(false);
      }
    }, 250);
    return () => window.clearTimeout(timer);
  }, [query, customerId, orderId, disabled]);

  return (
    <div className="adminProductPicker">
      <label className="adminProductPickerSearch">
        <Search size={17} aria-hidden="true" />
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={disabled ? disabledHint ?? "Önce bayi seçin" : "Ürün adı, SKU veya marka yazın (en az 2 harf)"}
          disabled={disabled}
          aria-label="Siparişe eklenecek ürünü ara"
        />
        {loading ? <LoaderCircle className="spin" size={17} aria-hidden="true" /> : null}
      </label>
      {error ? <p className="formError">{error}</p> : null}
      {lastAdded ? <p className="adminProductPickerAdded" role="status">{lastAdded} eklendi.</p> : null}
      {results.length > 0 ? (
        <ul className="adminProductPickerResults">
          {results.map((product) => (
            <li key={product.id}>
              <img src={product.image} alt="" loading="lazy" />
              <span className="adminProductPickerInfo">
                <strong>{product.name}</strong>
                <small>
                  {product.sku} · {product.brand} · {product.stockLabel}
                  {product.cartonQuantity > 1 ? ` · Koli ${product.cartonQuantity}` : ""}
                </small>
              </span>
              <span className="adminProductPickerPrice">
                <strong>{product.displayPrice}</strong>
                <small>{product.priceNote}</small>
              </span>
              <button
                type="button"
                className="btn btnPrimary"
                disabled={product.unitPrice === null}
                onClick={() => {
                  onAdd(product);
                  setLastAdded(product.name);
                }}
              >
                <Plus size={16} aria-hidden="true" /> Ekle
              </button>
            </li>
          ))}
        </ul>
      ) : query.trim().length >= 2 && !loading && !error && !disabled ? (
        <p className="adminProductPickerEmpty">Eşleşen yayındaki ürün bulunamadı.</p>
      ) : null}
    </div>
  );
}
