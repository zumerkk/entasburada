"use client";

import { useActionState, useMemo, useState } from "react";
import { Building2, CheckCircle2, CreditCard, Landmark, Minus, Plus, ReceiptText, Search, Trash2, Wallet } from "lucide-react";
import { formatOrderMoney, type AdminOrderCustomerOption, type AdminOrderProductOption } from "../../../../lib/admin-order-types";
import { AdminProductPicker } from "../AdminProductPicker";
import { createAdminOrderAction, type AdminOrderFormState } from "../actions";

interface BuilderLine {
  product: AdminOrderProductOption;
  quantity: number;
}

type PaymentMode = "account" | "transfer" | "card";

const paymentOptions: Array<{ value: PaymentMode; title: string; body: string; icon: typeof Wallet }> = [
  { value: "account", title: "Cari hesap", body: "Bayinin cari hesabına işlenir; finans onayı bekler.", icon: Wallet },
  { value: "transfer", title: "Havale / EFT", body: "Ödeme havale ile beklenir; finans onayı bekler.", icon: Landmark },
  { value: "card", title: "Kartla ödeme linki", body: "Müşteri gönderdiğiniz linkten giriş yapıp kartla öder.", icon: CreditCard }
];

export function AdminOrderBuilder({ customers, initialCustomerId }: { customers: AdminOrderCustomerOption[]; initialCustomerId?: string }) {
  const [state, formAction, pending] = useActionState<AdminOrderFormState, FormData>(createAdminOrderAction, {});
  const initialCustomer = customers.find((customer) => customer.id === initialCustomerId);
  const [customerId, setCustomerId] = useState(initialCustomer?.id ?? "");
  const [customerQuery, setCustomerQuery] = useState("");
  const [lines, setLines] = useState<BuilderLine[]>([]);
  const [deliveryAddress, setDeliveryAddress] = useState(initialCustomer?.deliveryAddress ?? "");
  const [paymentMode, setPaymentMode] = useState<PaymentMode>("account");

  const customer = customers.find((entry) => entry.id === customerId);
  const matches = useMemo(() => {
    const term = normalize(customerQuery);
    const list = term
      ? customers.filter((entry) =>
          [entry.companyName, entry.authorizedPerson, entry.email, entry.phone, entry.city].some((value) => normalize(value).includes(term))
        )
      : customers;
    return list.slice(0, 60);
  }, [customers, customerQuery]);

  const totals = useMemo(() => {
    const byCurrency = new Map<string, number>();
    for (const line of lines) {
      byCurrency.set(line.product.currency, (byCurrency.get(line.product.currency) ?? 0) + (line.product.unitPrice ?? 0) * line.quantity);
    }
    return [...byCurrency.entries()];
  }, [lines]);

  function selectCustomer(next: AdminOrderCustomerOption) {
    if (next.id === customerId) return;
    if (lines.length > 0 && !window.confirm("Bayi değişince fiyatlar yeniden hesaplanır ve eklenen ürünler temizlenir. Devam edilsin mi?")) return;
    setCustomerId(next.id);
    setDeliveryAddress(next.deliveryAddress);
    setLines([]);
  }

  function addProduct(product: AdminOrderProductOption) {
    const step = Math.max(1, product.minOrder || 1);
    setLines((current) => {
      const existing = current.find((line) => line.product.id === product.id);
      if (existing) return current.map((line) => (line.product.id === product.id ? { ...line, quantity: line.quantity + step } : line));
      return [...current, { product, quantity: step }];
    });
  }

  function setQuantity(productId: string, quantity: number) {
    setLines((current) =>
      current.map((line) =>
        line.product.id === productId ? { ...line, quantity: Math.max(Math.max(1, line.product.minOrder || 1), Math.min(999_999, Math.trunc(quantity) || 0)) } : line
      )
    );
  }

  const mixedCurrency = totals.length > 1;
  const canSubmit = Boolean(customer) && lines.length > 0 && !mixedCurrency && !pending;

  return (
    <form action={formAction} className="adminOrderBuilder">
      <input type="hidden" name="customerId" value={customerId} />
      <input type="hidden" name="lines" value={JSON.stringify(lines.map((line) => ({ productId: line.product.id, quantity: line.quantity })))} />
      <input type="hidden" name="paymentMode" value={paymentMode} />

      {state.error ? <p className="formError" role="alert">{state.error}</p> : null}

      <section className="panel adminOrderStep">
        <div className="panelHeader compact">
          <div>
            <h2><span className="adminOrderStepNo">1</span> Bayi seçin</h2>
            <p>Fiyatlar seçtiğiniz bayinin hesabına göre (KDV dahil) otomatik hesaplanır.</p>
          </div>
        </div>
        {customer ? (
          <div className="adminOrderSelectedCustomer">
            <Building2 size={20} aria-hidden="true" />
            <span>
              <strong>{customer.companyName}</strong>
              <small>
                {customer.authorizedPerson} · {customer.phone} · {customer.email} · {customer.channelLabel}
              </small>
            </span>
            <CheckCircle2 size={20} aria-hidden="true" className="adminOrderSelectedIcon" />
          </div>
        ) : null}
        <label className="adminProductPickerSearch">
          <Search size={17} aria-hidden="true" />
          <input
            type="search"
            value={customerQuery}
            onChange={(event) => setCustomerQuery(event.target.value)}
            placeholder={customer ? "Başka bayi seçmek için arayın" : "Firma adı, yetkili, telefon, e-posta veya il yazın"}
            aria-label="Bayi ara"
          />
        </label>
        <div className="adminOrderCustomerList" role="listbox" aria-label="Onaylı bayiler">
          {matches.map((entry) => (
            <button
              type="button"
              role="option"
              aria-selected={entry.id === customerId}
              className={entry.id === customerId ? "selected" : ""}
              key={entry.id}
              onClick={() => selectCustomer(entry)}
            >
              <strong>{entry.companyName}</strong>
              <small>
                {entry.authorizedPerson} · {entry.city || "—"} · {entry.channelLabel}
              </small>
            </button>
          ))}
          {matches.length === 0 ? <p className="adminProductPickerEmpty">Aramanızla eşleşen onaylı bayi yok.</p> : null}
        </div>
      </section>

      <section className="panel adminOrderStep">
        <div className="panelHeader compact">
          <div>
            <h2><span className="adminOrderStepNo">2</span> Ürünleri ekleyin</h2>
            <p>Ürün adı, SKU veya marka ile arayıp ekleyin; adetleri aşağıdan değiştirin.</p>
          </div>
        </div>
        <AdminProductPicker customerId={customerId} disabled={!customer} disabledHint="Ürün eklemek için önce bayi seçin" onAdd={addProduct} />
        {lines.length > 0 ? (
          <div className="adminOrderLines">
            {lines.map((line) => (
              <div className="adminOrderLine" key={line.product.id}>
                <img src={line.product.image} alt="" />
                <span className="adminOrderLineInfo">
                  <strong>{line.product.name}</strong>
                  <small>
                    {line.product.sku} · {line.product.displayPrice} / {line.product.unit}
                    {line.product.minOrder > 1 ? ` · Min. ${line.product.minOrder}` : ""}
                  </small>
                </span>
                <span className="adminQuantityControl">
                  <button type="button" aria-label="Azalt" onClick={() => setQuantity(line.product.id, line.quantity - 1)}>
                    <Minus size={15} />
                  </button>
                  <input
                    type="number"
                    min={Math.max(1, line.product.minOrder || 1)}
                    max={999999}
                    value={line.quantity}
                    onChange={(event) => setQuantity(line.product.id, Number(event.target.value))}
                    aria-label={`${line.product.name} adet`}
                  />
                  <button type="button" aria-label="Artır" onClick={() => setQuantity(line.product.id, line.quantity + 1)}>
                    <Plus size={15} />
                  </button>
                </span>
                <strong className="adminOrderLineTotal">{formatOrderMoney((line.product.unitPrice ?? 0) * line.quantity, line.product.currency)}</strong>
                <button
                  type="button"
                  className="adminOrderLineRemove"
                  aria-label={`${line.product.name} satırını çıkar`}
                  onClick={() => setLines((current) => current.filter((entry) => entry.product.id !== line.product.id))}
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p className="adminProductPickerEmpty">Henüz ürün eklenmedi.</p>
        )}
        {mixedCurrency ? <p className="formError">Farklı para birimindeki ürünler aynı siparişte olamaz; ayrı sipariş açın.</p> : null}
      </section>

      <section className="panel adminOrderStep">
        <div className="panelHeader compact">
          <div>
            <h2><span className="adminOrderStepNo">3</span> Teslimat ve ödeme</h2>
            <p>Sipariş oluşunca müşteriye gönderebileceğiniz sipariş linki hazırlanır.</p>
          </div>
        </div>
        <div className="adminPaymentOptions" role="radiogroup" aria-label="Ödeme şekli">
          {paymentOptions.map((option) => {
            const Icon = option.icon;
            return (
              <label key={option.value} className={paymentMode === option.value ? "selected" : ""}>
                <input type="radio" name="paymentModeChoice" value={option.value} checked={paymentMode === option.value} onChange={() => setPaymentMode(option.value)} />
                <Icon size={20} aria-hidden="true" />
                <span>
                  <strong>{option.title}</strong>
                  <small>{option.body}</small>
                </span>
              </label>
            );
          })}
        </div>
        <div className="adminFilterForm inlineCommercialForm adminOrderNotes">
          <label className="spanTwo">
            Teslimat adresi
            <textarea name="deliveryAddress" rows={2} value={deliveryAddress} onChange={(event) => setDeliveryAddress(event.target.value)} maxLength={600} />
          </label>
          <label>
            Sipariş notu
            <textarea name="customerNote" rows={2} maxLength={2000} />
          </label>
          <label>
            İç not (yalnız admin)
            <textarea name="internalNote" rows={2} maxLength={2000} />
          </label>
        </div>
      </section>

      <div className="adminOrderSubmitBar">
        <span>
          <ReceiptText size={18} aria-hidden="true" />
          {lines.length.toLocaleString("tr-TR")} ürün satırı ·{" "}
          <strong>{totals.length ? totals.map(([currency, amount]) => formatOrderMoney(amount, currency)).join(" + ") : formatOrderMoney(0, "TRY")}</strong>{" "}
          <small>KDV dahil</small>
        </span>
        <button className="btn btnPrimary" type="submit" disabled={!canSubmit}>
          {pending ? "Oluşturuluyor…" : "Siparişi oluştur"}
        </button>
      </div>
    </form>
  );
}

function normalize(value: string): string {
  return (value ?? "")
    .toLocaleLowerCase("tr-TR")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/ı/g, "i")
    .trim();
}
