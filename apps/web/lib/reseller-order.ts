import "server-only";
import type { CatalogProductRecord } from "@entas/catalog";
import { loadCatalogStore } from "./catalog-repository";
import {
  applyOrderCompanyApprovalPolicy,
  convertQuoteToOrder,
  createQuote,
  getOrderBySellerReference,
  priceQuote,
  updateQuoteStatus,
  type AdminOrder
} from "./commercial-repository";
import type { CustomerAccount } from "./customer-auth";
import { priceProductForCustomer } from "./customer-pricing";

export interface SellerOrderInput {
  externalOrderId: string;
  recipientName: string;
  recipientPhone: string;
  deliveryCity: string;
  deliveryAddress: string;
  note?: string;
  blindShipping?: boolean;
  items: Array<{ sku: string; quantity: number }>;
}

export interface SellerOrderResult {
  order: AdminOrder;
  created: boolean;
}

let sellerOrderQueue: Promise<void> = Promise.resolve();

export function createSellerOrder(customer: CustomerAccount, input: SellerOrderInput): Promise<SellerOrderResult> {
  const operation = sellerOrderQueue.then(() => createSellerOrderUnlocked(customer, input), () => createSellerOrderUnlocked(customer, input));
  sellerOrderQueue = operation.then(() => undefined, () => undefined);
  return operation;
}

async function createSellerOrderUnlocked(customer: CustomerAccount, input: SellerOrderInput): Promise<SellerOrderResult> {
  const access = customer.sellerAccess;
  if (!access?.enabled || (access.mode !== "dropshipping" && access.mode !== "hybrid")) {
    throw new Error("Bu hesapta dropshipping sipariş yetkisi yok.");
  }
  if (input.blindShipping && !access.blindShippingEnabled) {
    throw new Error("Bu hesapta kör kargo yetkisi yok.");
  }

  const externalOrderId = clean(input.externalOrderId).slice(0, 100);
  if (externalOrderId.length < 2) throw new Error("Tekil mağaza sipariş numarası zorunludur.");
  const existing = await getOrderBySellerReference(customer.email, externalOrderId);
  if (existing) return { order: existing, created: false };

  const recipientName = clean(input.recipientName).slice(0, 140);
  const recipientPhone = clean(input.recipientPhone).slice(0, 32);
  const deliveryCity = clean(input.deliveryCity).slice(0, 100);
  const deliveryAddress = clean(input.deliveryAddress).slice(0, 600);
  if (recipientName.length < 2 || recipientPhone.length < 10) throw new Error("Alıcı adı ve telefonu zorunludur.");
  if (deliveryCity.length < 2 || deliveryAddress.length < 10) throw new Error("Geçerli teslimat ili ve açık adres zorunludur.");
  if (!Array.isArray(input.items) || input.items.length < 1 || input.items.length > 50) throw new Error("Siparişte 1–50 ürün satırı olmalıdır.");

  const store = await loadCatalogStore();
  const resolved = input.items.map((line) => resolveLine(store.products, customer, line));
  const currencies = new Set(resolved.map((line) => line.currency));
  if (currencies.size > 1) throw new Error("Farklı para birimindeki ürünler ayrı sipariş edilmelidir.");

  const note = clean(input.note).slice(0, 2_000);
  const quote = await createQuote({
    companyTitle: customer.companyName,
    authorizedPerson: customer.authorizedPerson,
    phone: customer.phone,
    email: customer.email,
    projectName: `Dropshipping · ${externalOrderId}`,
    projectCode: externalOrderId,
    deliveryCity,
    deliveryAddress,
    paymentPreference: "Cari hesap",
    notes: [
      `Satıcı sipariş referansı: ${externalOrderId}`,
      input.blindShipping ? "Kör kargo: ENTAŞBURADA fiyat/fatura/marka evraksız sevkiyat talebi." : "Standart dropshipping sevkiyatı.",
      note
    ].filter(Boolean).join(" · "),
    fulfillmentType: "DROPSHIP",
    recipientName,
    recipientPhone,
    sellerOrderReference: externalOrderId,
    blindShipping: Boolean(input.blindShipping),
    items: resolved.map((line) => ({
      sku: line.product.sku,
      productName: line.product.name,
      quantity: line.quantity,
      unit: line.product.unitType,
      targetPrice: line.unitPrice
    }))
  });
  const unitPriceBySku = new Map(resolved.map((line) => [normalize(line.product.sku), line.unitPrice]));
  const priced = await priceQuote({
    quoteId: quote.id,
    salesRepresentative: "Satıcı fiyat motoru",
    internalNote: `Dropshipping siparişi otomatik fiyatlandırıldı. Referans: ${externalOrderId}`,
    prices: quote.items.map((item) => ({ itemId: item.id, quotedUnitPrice: unitPriceBySku.get(normalize(item.sku)) ?? item.targetPrice ?? "0.00" }))
  }, "Satıcı fiyat motoru");
  await updateQuoteStatus(priced.id, "APPROVED", customer.authorizedPerson, "Satıcı dropshipping siparişini onayladı.");
  const created = await convertQuoteToOrder(priced.id, customer.authorizedPerson, "customer");
  const order = await applyOrderCompanyApprovalPolicy(created.id, customer);
  return { order, created: true };
}

function resolveLine(products: CatalogProductRecord[], customer: CustomerAccount, line: { sku: string; quantity: number }) {
  const sku = normalize(line.sku);
  if (!sku) throw new Error("Her ürün satırında SKU zorunludur.");
  const matches = products.filter((product) => product.status === "ACTIVE" && product.isVisible && normalize(product.sku) === sku);
  if (matches.length !== 1) throw new Error(`${clean(line.sku)} SKU aktif katalogda tekil olarak bulunamadı.`);
  const product = matches[0]!;
  const minimum = Math.max(1, Math.trunc(product.minOrder ?? 1));
  const quantity = Math.trunc(Number(line.quantity));
  if (!Number.isFinite(quantity) || quantity < minimum || quantity > 999_999) {
    throw new Error(`${product.sku} için miktar en az ${minimum} olmalıdır.`);
  }
  if (product.stockQuantityKnown === false) throw new Error(`${product.sku} için stok teyidi gerekiyor; API siparişi yerine teklif oluşturun.`);
  if ((product.stockStatus !== "in_stock" && product.stockStatus !== "low_stock") || product.stockQuantity <= 0) {
    throw new Error(`${product.sku} şu anda siparişe açık stokta değil.`);
  }
  if (quantity > product.stockQuantity) throw new Error(`${product.sku} için mevcut stok ${Math.max(0, Math.trunc(product.stockQuantity))} ${product.unitType}.`);
  const price = priceProductForCustomer(product, customer);
  if (!price) throw new Error(`${product.sku} için otomatik satış fiyatı yok; teklif oluşturun.`);
  return { product, quantity, unitPrice: price.unitNetPrice, currency: product.currency === "TL" ? "TRY" : product.currency || "TRY" };
}

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalize(value: string): string {
  return clean(value).toLocaleLowerCase("tr-TR");
}
