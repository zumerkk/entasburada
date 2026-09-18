"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { Lock, Minus, Plus, RotateCcw, Save, Trash2 } from "lucide-react";
import { formatOrderMoney, type AdminOrderProductOption } from "../../../../lib/admin-order-types";
import { AdminProductPicker } from "../AdminProductPicker";
import { updateOrderItemsAction, type AdminOrderFormState } from "../actions";

export interface EditorOrderItem {
  id: string;
  sku: string;
  productName: string;
  unit: string;
  quantity: number;
  unitPrice: string;
}

interface AdminOrderItemsEditorProps {
  orderId: string;
  currency: string;
  totalAmount: string;
  items: EditorOrderItem[];
  /** Kayıt değişince yerel düzenleme durumu sıfırlanır. */
  revision: string;
  blockReason: string | null;
}

interface Addition {
  product: AdminOrderProductOption;
  quantity: number;
}

export function AdminOrderItemsEditor({ orderId, currency, totalAmount, items, revision, blockReason }: AdminOrderItemsEditorProps) {
  const [state, formAction, pending] = useActionState<AdminOrderFormState, FormData>(updateOrderItemsAction, {});
  const initialQuantities = useMemo(() => Object.fromEntries(items.map((item) => [item.id, item.quantity])), [items]);
  const [quantities, setQuantities] = useState<Record<string, number>>(initialQuantities);
  const [additions, setAdditions] = useState<Addition[]>([]);
  const [note, setNote] = useState("");

  useEffect(() => {
    setQuantities(initialQuantities);
    setAdditions([]);
    setNote("");
  }, [revision, initialQuantities]);

  const editable = !blockReason;
  const changes = items
    .filter((item) => (quantities[item.id] ?? item.quantity) !== item.quantity)
    .map((item) => ({ itemId: item.id, quantity: quantities[item.id] ?? item.quantity }));
  const dirty = changes.length > 0 || additions.length > 0;
  const newTotal =
    items.reduce((sum, item) => sum + parseAmount(item.unitPrice) * (quantities[item.id] ?? item.quantity), 0) +
    additions.reduce((sum, addition) => sum + (addition.product.unitPrice ?? 0) * addition.quantity, 0);
  const remainingLines = items.filter((item) => (quantities[item.id] ?? item.quantity) > 0).length + additions.length;

  function setItemQuantity(itemId: string, value: number) {
    setQuantities((current) => ({ ...current, [itemId]: Math.max(0, Math.min(999_999, Math.trunc(value) || 0)) }));
  }

  function addProduct(product: AdminOrderProductOption) {
    const step = Math.max(1, product.minOrder || 1);
    setAdditions((current) => {
      const existing = current.find((entry) => entry.product.id === product.id);
      if (existing) return current.map((entry) => (entry.product.id === product.id ? { ...entry, quantity: entry.quantity + step } : entry));
      return [...current, { product, quantity: step }];
    });
  }

  return (
    <form action={formAction} className="adminOrderItemsEditor">
      <input type="hidden" name="orderId" value={orderId} />
      <input type="hidden" name="changes" value={JSON.stringify(changes)} />
      <input type="hidden" name="additions" value={JSON.stringify(additions.map((entry) => ({ productId: entry.product.id, quantity: entry.quantity })))} />

      {state.error ? <p className="formError" role="alert">{state.error}</p> : null}
      {state.message && !dirty ? <p className="formSuccess" role="status">{state.message}</p> : null}
      {blockReason ? (
        <p className="adminOrderEditLocked">
          <Lock size={16} aria-hidden="true" /> {blockReason}
        </p>
      ) : null}

      <div className="adminOrderLines">
        {items.map((item) => {
          const quantity = quantities[item.id] ?? item.quantity;
          const removed = quantity === 0;
          return (
            <div className={`adminOrderLine${removed ? " removed" : ""}${quantity !== item.quantity && !removed ? " changed" : ""}`} key={item.id}>
              <span className="adminOrderLineInfo">
                <strong>{item.productName}</strong>
                <small>
                  {item.sku} · {formatOrderMoney(parseAmount(item.unitPrice), currency)} / {item.unit}
                  {quantity !== item.quantity ? ` · önceki adet ${item.quantity}` : ""}
                </small>
              </span>
              {editable ? (
                <span className="adminQuantityControl">
                  <button type="button" aria-label="Azalt" onClick={() => setItemQuantity(item.id, quantity - 1)} disabled={removed}>
                    <Minus size={15} />
                  </button>
                  <input
                    type="number"
                    min={0}
                    max={999999}
                    value={quantity}
                    onChange={(event) => setItemQuantity(item.id, Number(event.target.value))}
                    aria-label={`${item.productName} adet`}
                  />
                  <button type="button" aria-label="Artır" onClick={() => setItemQuantity(item.id, quantity + 1)}>
                    <Plus size={15} />
                  </button>
                </span>
              ) : (
                <span>
                  {item.quantity} {item.unit}
                </span>
              )}
              <strong className="adminOrderLineTotal">{removed ? "Çıkarılacak" : formatOrderMoney(parseAmount(item.unitPrice) * quantity, currency)}</strong>
              {editable ? (
                <button
                  type="button"
                  className="adminOrderLineRemove"
                  aria-label={removed ? `${item.productName} satırını geri al` : `${item.productName} satırını çıkar`}
                  onClick={() => setItemQuantity(item.id, removed ? item.quantity : 0)}
                >
                  {removed ? <RotateCcw size={16} /> : <Trash2 size={16} />}
                </button>
              ) : null}
            </div>
          );
        })}
        {additions.map((addition) => (
          <div className="adminOrderLine added" key={addition.product.id}>
            <span className="adminOrderLineInfo">
              <strong>{addition.product.name}</strong>
              <small>
                Yeni · {addition.product.sku} · {addition.product.displayPrice} / {addition.product.unit}
              </small>
            </span>
            <span className="adminQuantityControl">
              <button
                type="button"
                aria-label="Azalt"
                onClick={() =>
                  setAdditions((current) =>
                    current.map((entry) => (entry.product.id === addition.product.id ? { ...entry, quantity: Math.max(1, entry.quantity - 1) } : entry))
                  )
                }
              >
                <Minus size={15} />
              </button>
              <input
                type="number"
                min={1}
                max={999999}
                value={addition.quantity}
                onChange={(event) =>
                  setAdditions((current) =>
                    current.map((entry) =>
                      entry.product.id === addition.product.id ? { ...entry, quantity: Math.max(1, Math.min(999_999, Math.trunc(Number(event.target.value)) || 1)) } : entry
                    )
                  )
                }
                aria-label={`${addition.product.name} adet`}
              />
              <button
                type="button"
                aria-label="Artır"
                onClick={() =>
                  setAdditions((current) => current.map((entry) => (entry.product.id === addition.product.id ? { ...entry, quantity: entry.quantity + 1 } : entry)))
                }
              >
                <Plus size={15} />
              </button>
            </span>
            <strong className="adminOrderLineTotal">{formatOrderMoney((addition.product.unitPrice ?? 0) * addition.quantity, addition.product.currency)}</strong>
            <button
              type="button"
              className="adminOrderLineRemove"
              aria-label={`${addition.product.name} eklemesini kaldır`}
              onClick={() => setAdditions((current) => current.filter((entry) => entry.product.id !== addition.product.id))}
            >
              <Trash2 size={16} />
            </button>
          </div>
        ))}
      </div>

      {editable ? (
        <>
          <div className="adminOrderEditAdd">
            <strong>Ürün ekle</strong>
            <AdminProductPicker orderId={orderId} onAdd={addProduct} />
          </div>
          <div className="adminOrderSubmitBar">
            <span>
              Mevcut toplam {formatOrderMoney(parseAmount(totalAmount), currency)} → <strong>{formatOrderMoney(newTotal, currency)}</strong>{" "}
              <small>KDV dahil</small>
              {remainingLines === 0 ? <small className="formError"> Siparişte en az bir ürün kalmalı.</small> : null}
            </span>
            <input name="note" value={note} onChange={(event) => setNote(event.target.value)} maxLength={500} placeholder="Düzeltme notu (opsiyonel; müşterinin sipariş geçmişinde de görünür)" />
            <button
              type="button"
              className="btn btnGhost dark"
              disabled={!dirty || pending}
              onClick={() => {
                setQuantities(initialQuantities);
                setAdditions([]);
              }}
            >
              Vazgeç
            </button>
            <button className="btn btnPrimary" type="submit" disabled={!dirty || pending || remainingLines === 0}>
              <Save size={17} aria-hidden="true" />
              {pending ? "Kaydediliyor…" : "Değişiklikleri kaydet"}
            </button>
          </div>
        </>
      ) : null}
    </form>
  );
}

function parseAmount(value: string): number {
  const raw = (value ?? "").trim().replace(/\s/g, "");
  const parsed = Number(raw.includes(",") ? raw.replace(/\./g, "").replace(",", ".") : raw);
  return Number.isFinite(parsed) ? parsed : 0;
}
