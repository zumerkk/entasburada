/** Admin sipariş oluşturma/düzeltme ekranlarının istemci ile paylaştığı veri tipleri. */

export interface AdminOrderProductOption {
  id: string;
  sku: string;
  name: string;
  brand: string;
  image: string;
  unit: string;
  minOrder: number;
  cartonQuantity: number;
  stockLabel: string;
  currency: string;
  /** Seçili bayi için KDV dahil birim fiyat; fiyatsız ürünlerde null. */
  unitPrice: number | null;
  displayPrice: string;
  priceNote: string;
}

export interface AdminOrderCustomerOption {
  id: string;
  companyName: string;
  authorizedPerson: string;
  email: string;
  phone: string;
  city: string;
  deliveryAddress: string;
  channelLabel: string;
}

export function formatOrderMoney(value: number, currency: string): string {
  const normalized = currency === "TL" || !currency ? "TRY" : currency;
  try {
    return new Intl.NumberFormat("tr-TR", { style: "currency", currency: normalized, maximumFractionDigits: 2 }).format(value);
  } catch {
    return `${value.toFixed(2)} ${normalized}`;
  }
}
