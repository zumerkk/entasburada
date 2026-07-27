"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowRight, Check, LoaderCircle, Minus, Plus, ShoppingCart } from "lucide-react";
import { CART_CHANGED_EVENT, type CartChangedDetail } from "./cart-events";

type AddStatus = "idle" | "loading" | "added" | "error";

interface AddToCartControlProps {
  sku: string;
  name: string;
  unit: string;
  minOrder: number;
  isAuthenticated: boolean;
  variant?: "card" | "detail";
}

interface CartResponse {
  error?: string;
  cart?: {
    items?: Array<{ quantity?: number }>;
  };
}

const MAX_QUANTITY = 999_999;

export function AddToCartControl({
  sku,
  name,
  unit,
  minOrder,
  isAuthenticated,
  variant = "card"
}: AddToCartControlProps) {
  const minimum = Math.max(1, positiveInteger(minOrder, 1));
  const [quantity, setQuantity] = useState(minimum);
  const [status, setStatus] = useState<AddStatus>("idle");
  const [message, setMessage] = useState("");
  const resetTimer = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (resetTimer.current !== null) window.clearTimeout(resetTimer.current);
    };
  }, []);

  const updateQuantity = (next: number) => {
    setQuantity(Math.min(MAX_QUANTITY, Math.max(minimum, Math.trunc(next) || minimum)));
    if (status === "error") {
      setStatus("idle");
      setMessage("");
    }
  };

  const addToCart = async () => {
    if (!isAuthenticated) {
      const next = `${window.location.pathname}${window.location.search}`;
      window.location.assign(`/login?next=${encodeURIComponent(next)}`);
      return;
    }

    setStatus("loading");
    setMessage("");
    try {
      const response = await fetch("/api/cart", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: [{ sku, productName: name, quantity, unit }] })
      });
      const payload = (await response.json().catch(() => ({}))) as CartResponse;
      if (response.status === 401) {
        const next = `${window.location.pathname}${window.location.search}`;
        window.location.assign(`/login?next=${encodeURIComponent(next)}`);
        return;
      }
      if (!response.ok || !payload.cart?.items) {
        throw new Error(payload.error || "Ürün sepete eklenemedi.");
      }

      const detail: CartChangedDetail = {
        lineCount: payload.cart.items.length,
        totalQuantity: payload.cart.items.reduce((sum, item) => sum + positiveInteger(item.quantity, 0), 0)
      };
      window.dispatchEvent(new CustomEvent<CartChangedDetail>(CART_CHANGED_EVENT, { detail }));
      setStatus("added");
      setMessage(`${quantity.toLocaleString("tr-TR")} ${unit} sepete eklendi.`);
      if (resetTimer.current !== null) window.clearTimeout(resetTimer.current);
      resetTimer.current = window.setTimeout(() => setStatus("idle"), 2400);
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "Ürün sepete eklenemedi.");
    }
  };

  return (
    <div className={`addToCartControl ${variant}`}>
      <div className="cartQuantityControl" aria-label={`${name} sipariş miktarı`}>
        <button
          type="button"
          onClick={() => updateQuantity(quantity - 1)}
          disabled={quantity <= minimum || status === "loading"}
          aria-label="Miktarı azalt"
          title="Miktarı azalt"
        >
          <Minus size={15} aria-hidden="true" />
        </button>
        <input
          type="number"
          min={minimum}
          max={MAX_QUANTITY}
          value={quantity}
          onChange={(event) => updateQuantity(Number(event.target.value))}
          disabled={status === "loading"}
          aria-label="Miktar"
        />
        <button
          type="button"
          onClick={() => updateQuantity(quantity + 1)}
          disabled={quantity >= MAX_QUANTITY || status === "loading"}
          aria-label="Miktarı artır"
          title="Miktarı artır"
        >
          <Plus size={15} aria-hidden="true" />
        </button>
        <span>{unit}</span>
      </div>
      <button
        className={`btn btnPrimary addToCartButton${status === "added" ? " added" : ""}`}
        type="button"
        onClick={addToCart}
        disabled={status === "loading"}
      >
        {status === "loading" ? (
          <LoaderCircle className="spin" size={17} aria-hidden="true" />
        ) : status === "added" ? (
          <Check size={17} aria-hidden="true" />
        ) : (
          <ShoppingCart size={17} aria-hidden="true" />
        )}
        {status === "loading" ? "Ekleniyor" : status === "added" ? "Eklendi" : status === "error" ? "Tekrar Dene" : "Sepete Ekle"}
      </button>
      <div className={`cartAddFeedback ${status}`} aria-live="polite">
        {message ? <span>{message}</span> : variant === "detail" && minimum > 1 ? <span>Minimum {minimum.toLocaleString("tr-TR")} {unit}</span> : null}
        {status === "added" ? (
          <a href="/cart">
            Sepeti aç <ArrowRight size={14} aria-hidden="true" />
          </a>
        ) : null}
      </div>
    </div>
  );
}

function positiveInteger(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.trunc(parsed) : fallback;
}
