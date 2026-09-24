"use client";

import { useState } from "react";

export function AddressFields() {
  const [invoiceAddress, setInvoiceAddress] = useState("");
  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [sameAddress, setSameAddress] = useState(false);

  return <>
    <label className="spanTwo">
      Fatura adresi
      <textarea name="invoiceAddress" required value={invoiceAddress} onChange={event => setInvoiceAddress(event.target.value)} />
    </label>
    <label className="checkLabel spanTwo">
      <input name="sameAddress" type="checkbox" checked={sameAddress} onChange={event => setSameAddress(event.target.checked)} />
      Teslimat adresim fatura adresimle aynı
    </label>
    <label className="spanTwo">
      Teslimat adresi
      <textarea name="deliveryAddress" required readOnly={sameAddress} value={sameAddress ? invoiceAddress : deliveryAddress} onChange={event => setDeliveryAddress(event.target.value)} />
      {sameAddress ? <small>Fatura adresiniz otomatik kullanılır. Farklı bir adres için işareti kaldırın.</small> : null}
    </label>
  </>;
}
