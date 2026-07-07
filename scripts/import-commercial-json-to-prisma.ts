import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Prisma, disconnectDatabase, prisma } from "../packages/database/src/index";

type CustomerSegment = "standard" | "industrial" | "project";

interface CustomerAccount {
  id: string;
  email: string;
  password: string;
  companyName: string;
  authorizedPerson: string;
  phone: string;
  city: string;
  deliveryAddress: string;
  status: "approved" | "pending" | "suspended";
  segment: CustomerSegment;
  tierName?: string;
  tierRank?: string;
  paymentTermDays?: number;
  creditLimit?: string;
  approvalLimit?: string;
  baseDiscountRate: number;
  brandDiscounts: Record<string, number>;
  categoryDiscounts: Record<string, number>;
  specialNetPrices: Record<string, string>;
}

interface LegacyQuoteItem {
  id: string;
  sku: string;
  barcode?: string;
  manufacturerCode?: string;
  productName: string;
  brand?: string;
  category?: string;
  unit: string;
  quantity: number;
  targetPrice?: string;
  quotedUnitPrice?: string;
  lineTotal?: string;
  currency: string;
  stockStatus?: string;
  catalogListPrice?: string;
}

interface LegacyQuote {
  id: string;
  quoteNo: string;
  trackingCode: string;
  companyName: string;
  dealerName: string;
  authorizedPerson: string;
  phone: string;
  email: string;
  projectName: string;
  projectCode: string;
  deliveryCity: string;
  deliveryAddress: string;
  requestedAt: string;
  status: string;
  totalAmount: string;
  currency: string;
  salesRepresentative: string;
  lastActionAt: string;
  validUntil: string;
  paymentPreference: string;
  customerNote: string;
  internalNote: string;
  convertedToOrder: boolean;
  convertedOrderId?: string;
  items: LegacyQuoteItem[];
  history: unknown[];
}

interface LegacyOrderItem {
  id: string;
  sku: string;
  productName: string;
  brand?: string;
  category?: string;
  unit: string;
  quantity: number;
  unitPrice: string;
  lineTotal: string;
  currency: string;
  stockStatus?: string;
  quoteItemId?: string;
}

interface LegacyOrder {
  id: string;
  orderNo: string;
  trackingCode: string;
  quoteId?: string;
  quoteNo?: string;
  companyName: string;
  dealerUser: string;
  phone: string;
  email: string;
  orderedAt: string;
  status: string;
  paymentStatus: string;
  financeApproval: string;
  stockStatus: string;
  shipmentStatus: string;
  totalAmount: string;
  currency: string;
  salesRepresentative: string;
  deliveryAddress: string;
  source: string;
  warehouse: string;
  customerNote: string;
  internalNote: string;
  items: LegacyOrderItem[];
  history: unknown[];
}

interface LegacyCart {
  customerId: string;
  updatedAt: string;
  items: Array<{
    id: string;
    sku: string;
    productName: string;
    quantity: number;
    unit: string;
    addedAt: string;
  }>;
}

interface LegacyNotification {
  id: string;
  recipientType: string;
  recipientKey: string;
  level: string;
  title: string;
  body: string;
  href?: string;
  readAt?: string;
  createdAt: string;
}

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function main(): Promise<void> {
  const customers = await readJson<CustomerAccount[]>("data/customer-accounts.json", []);
  const quotes = await readJson<LegacyQuote[]>("data/quotes.json", []);
  const orders = await readJson<LegacyOrder[]>("data/orders.json", []);
  const carts = await readJson<LegacyCart[]>("data/carts.json", []);
  const notifications = await readJson<LegacyNotification[]>("data/notifications.json", []);

  const summary = await prisma.$transaction(async (tx) => {
    for (const customer of customers) {
      await upsertCustomerAccount(tx, customer);
    }

    for (const quote of quotes) {
      await upsertLegacyQuote(tx, quote, customers);
    }

    for (const order of orders) {
      await upsertLegacyOrder(tx, order, customers);
    }

    for (const cart of carts) {
      await upsertLegacyCart(tx, cart);
    }

    for (const notification of notifications) {
      await upsertLegacyNotification(tx, notification);
    }

    return {
      customers: customers.length,
      quotes: quotes.length,
      orders: orders.length,
      carts: carts.length,
      notifications: notifications.length
    };
  });

  console.log(JSON.stringify({ ok: true, imported: summary }, null, 2));
}

async function upsertCustomerAccount(tx: Prisma.TransactionClient, customer: CustomerAccount): Promise<void> {
  const segment = await tx.dealerSegment.upsert({
    where: { code: customer.segment },
    update: {
      name: customer.tierName ?? segmentName(customer.segment),
      description: customer.tierRank ?? null
    },
    create: {
      code: customer.segment,
      name: customer.tierName ?? segmentName(customer.segment),
      description: customer.tierRank ?? null
    }
  });

  await tx.company.upsert({
    where: { dealerCode: customer.id },
    update: {
      legalName: customer.companyName,
      status: companyStatus(customer.status),
      segmentId: segment.id,
      creditLimit: decimal(customer.creditLimit),
      orderLimit: decimal(customer.approvalLimit),
      paymentTermDays: customer.paymentTermDays ?? null,
      discountGroup: customer.tierRank ?? customer.segment
    },
    create: {
      id: customer.id,
      legalName: customer.companyName,
      dealerCode: customer.id,
      status: companyStatus(customer.status),
      segmentId: segment.id,
      creditLimit: decimal(customer.creditLimit),
      orderLimit: decimal(customer.approvalLimit),
      paymentTermDays: customer.paymentTermDays ?? null,
      discountGroup: customer.tierRank ?? customer.segment
    }
  });

  const userId = `user-${customer.id}`;
  await tx.user.upsert({
    where: { email: customer.email },
    update: {
      name: customer.authorizedPerson,
      phone: customer.phone,
      status: customer.status === "approved" ? "ACTIVE" : "DISABLED"
    },
    create: {
      id: userId,
      email: customer.email,
      name: customer.authorizedPerson,
      phone: customer.phone,
      status: customer.status === "approved" ? "ACTIVE" : "DISABLED"
    }
  });

  await tx.companyUser.upsert({
    where: { companyId_userId: { companyId: customer.id, userId } },
    update: {
      companyRole: "COMPANY_OWNER",
      isOwner: true,
      approvalLimit: decimal(customer.approvalLimit)
    },
    create: {
      companyId: customer.id,
      userId,
      companyRole: "COMPANY_OWNER",
      isOwner: true,
      approvalLimit: decimal(customer.approvalLimit)
    }
  });

  await tx.address.upsert({
    where: { id: `address-${customer.id}-delivery` },
    update: {
      title: "Teslimat",
      contactName: customer.authorizedPerson,
      phone: customer.phone,
      city: customer.city,
      district: "",
      line1: customer.deliveryAddress,
      isDelivery: true
    },
    create: {
      id: `address-${customer.id}-delivery`,
      companyId: customer.id,
      title: "Teslimat",
      contactName: customer.authorizedPerson,
      phone: customer.phone,
      city: customer.city,
      district: "",
      line1: customer.deliveryAddress,
      isDelivery: true
    }
  });

  await tx.creditAccount.upsert({
    where: { companyId: customer.id },
    update: {
      creditLimit: decimal(customer.creditLimit),
      availableLimit: decimal(customer.creditLimit),
      paymentTermDays: customer.paymentTermDays ?? null,
      riskStatus: customer.tierRank ?? customer.segment
    },
    create: {
      companyId: customer.id,
      creditLimit: decimal(customer.creditLimit),
      availableLimit: decimal(customer.creditLimit),
      paymentTermDays: customer.paymentTermDays ?? null,
      riskStatus: customer.tierRank ?? customer.segment
    }
  });
}

async function upsertLegacyQuote(tx: Prisma.TransactionClient, quote: LegacyQuote, customers: CustomerAccount[]): Promise<void> {
  const { companyId, userId } = await ensureCommercialIdentity(tx, {
    email: quote.email,
    companyName: quote.companyName,
    contactName: quote.authorizedPerson || quote.dealerName,
    phone: quote.phone
  }, customers);

  await tx.quoteRequest.upsert({
    where: { quoteNo: quote.quoteNo },
    update: quoteData(quote, companyId, userId),
    create: {
      id: quote.id,
      quoteNo: quote.quoteNo,
      ...quoteData(quote, companyId, userId)
    }
  });

  await tx.quoteItem.deleteMany({ where: { quoteRequestId: quote.id } });
  for (const item of quote.items) {
    await tx.quoteItem.create({
      data: {
        id: item.id,
        quoteRequestId: quote.id,
        sku: item.sku,
        barcode: optional(item.barcode),
        manufacturerCode: optional(item.manufacturerCode),
        productName: optional(item.productName),
        brandName: optional(item.brand),
        categoryName: optional(item.category),
        quantity: item.quantity,
        unitType: item.unit || "Adet",
        targetNetPrice: nullableDecimal(item.targetPrice),
        offeredNetPrice: nullableDecimal(item.quotedUnitPrice),
        lineTotal: nullableDecimal(item.lineTotal),
        currency: item.currency || quote.currency || "TRY",
        stockStatus: optional(item.stockStatus),
        catalogListPrice: nullableDecimal(item.catalogListPrice),
        legacyPayload: item as Prisma.InputJsonValue
      }
    });
  }
}

async function upsertLegacyOrder(tx: Prisma.TransactionClient, order: LegacyOrder, customers: CustomerAccount[]): Promise<void> {
  const { companyId, userId } = await ensureCommercialIdentity(tx, {
    email: order.email,
    companyName: order.companyName,
    contactName: order.dealerUser,
    phone: order.phone
  }, customers);

  await tx.order.upsert({
    where: { orderNo: order.orderNo },
    update: orderData(order, companyId, userId),
    create: {
      id: order.id,
      orderNo: order.orderNo,
      ...orderData(order, companyId, userId)
    }
  });

  await tx.orderItem.deleteMany({ where: { orderId: order.id } });
  for (const item of order.items) {
    await tx.orderItem.create({
      data: {
        id: item.id,
        orderId: order.id,
        quoteItemId: optional(item.quoteItemId),
        sku: item.sku,
        productName: item.productName,
        brandName: optional(item.brand),
        categoryName: optional(item.category),
        quantity: item.quantity,
        unitType: item.unit || "Adet",
        netUnitPrice: decimal(item.unitPrice),
        lineTotal: decimal(item.lineTotal),
        taxRate: decimal("20"),
        currency: item.currency || order.currency || "TRY",
        stockStatus: optional(item.stockStatus),
        legacyPayload: item as Prisma.InputJsonValue
      }
    });
  }
}

async function upsertLegacyCart(tx: Prisma.TransactionClient, cart: LegacyCart): Promise<void> {
  const company = await tx.company.findUnique({ where: { id: cart.customerId }, select: { id: true } });
  const user = await tx.user.findFirst({ where: { companyUsers: { some: { companyId: cart.customerId } } }, select: { id: true } });
  const cartId = `cart-${cart.customerId}`;

  await tx.cart.upsert({
    where: { id: cartId },
    update: {
      companyId: company?.id ?? null,
      userId: user?.id ?? null,
      legacyCustomerId: cart.customerId,
      status: "ACTIVE",
      legacyPayload: cart as Prisma.InputJsonValue,
      updatedAt: date(cart.updatedAt)
    },
    create: {
      id: cartId,
      companyId: company?.id ?? null,
      userId: user?.id ?? null,
      legacyCustomerId: cart.customerId,
      status: "ACTIVE",
      legacyPayload: cart as Prisma.InputJsonValue,
      createdAt: date(cart.updatedAt),
      updatedAt: date(cart.updatedAt)
    }
  });

  await tx.cartItem.deleteMany({ where: { cartId } });
  for (const item of cart.items) {
    await tx.cartItem.create({
      data: {
        id: item.id,
        cartId,
        sku: item.sku,
        productName: item.productName,
        quantity: item.quantity,
        unitType: item.unit || "Adet",
        legacyPayload: item as Prisma.InputJsonValue,
        createdAt: date(item.addedAt),
        updatedAt: date(cart.updatedAt)
      }
    });
  }
}

async function upsertLegacyNotification(tx: Prisma.TransactionClient, notification: LegacyNotification): Promise<void> {
  const user = await tx.user.findUnique({ where: { email: notification.recipientKey }, select: { id: true } });

  await tx.notification.upsert({
    where: { id: notification.id },
    update: notificationData(notification, user?.id ?? null),
    create: {
      id: notification.id,
      ...notificationData(notification, user?.id ?? null)
    }
  });
}

async function ensureCommercialIdentity(
  tx: Prisma.TransactionClient,
  input: { email: string; companyName: string; contactName: string; phone: string },
  customers: CustomerAccount[]
): Promise<{ companyId: string; userId: string }> {
  const existingCustomer = customers.find((customer) => normalize(customer.email) === normalize(input.email));
  if (existingCustomer) {
    await upsertCustomerAccount(tx, existingCustomer);
    return { companyId: existingCustomer.id, userId: `user-${existingCustomer.id}` };
  }

  const dealerCode = `legacy-${normalize(input.email || input.companyName).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48) || "public"}`;
  const company = await tx.company.upsert({
    where: { dealerCode },
    update: {
      legalName: input.companyName,
      status: "APPROVED"
    },
    create: {
      legalName: input.companyName,
      dealerCode,
      status: "APPROVED"
    }
  });

  const user = await tx.user.upsert({
    where: { email: input.email },
    update: {
      name: input.contactName,
      phone: input.phone,
      status: "ACTIVE"
    },
    create: {
      email: input.email,
      name: input.contactName,
      phone: input.phone,
      status: "ACTIVE"
    }
  });

  await tx.companyUser.upsert({
    where: { companyId_userId: { companyId: company.id, userId: user.id } },
    update: {},
    create: {
      companyId: company.id,
      userId: user.id,
      companyRole: "PURCHASE_MANAGER",
      isOwner: true
    }
  });

  return { companyId: company.id, userId: user.id };
}

function quoteData(quote: LegacyQuote, companyId: string, userId: string): Prisma.QuoteRequestUncheckedCreateInput {
  return {
    trackingCode: quote.trackingCode,
    companyId,
    userId,
    salesRepresentativeName: quote.salesRepresentative,
    status: quoteStatus(quote.status),
    contactName: quote.authorizedPerson || quote.dealerName,
    contactPhone: quote.phone,
    contactEmail: quote.email,
    projectName: optional(quote.projectName),
    projectCode: optional(quote.projectCode),
    deliveryCity: optional(quote.deliveryCity),
    deliveryAddress: optional(quote.deliveryAddress),
    paymentPreference: paymentMethod(quote.paymentPreference),
    validUntil: nullableDate(quote.validUntil),
    currency: quote.currency || "TRY",
    totalAmount: decimal(quote.totalAmount),
    notes: optional(quote.customerNote),
    internalNote: optional(quote.internalNote),
    convertedToOrder: Boolean(quote.convertedToOrder),
    convertedOrderId: optional(quote.convertedOrderId),
    history: quote.history as Prisma.InputJsonValue,
    legacyPayload: quote as Prisma.InputJsonValue,
    createdAt: date(quote.requestedAt),
    updatedAt: date(quote.lastActionAt || quote.requestedAt)
  };
}

function orderData(order: LegacyOrder, companyId: string, userId: string): Prisma.OrderUncheckedCreateInput {
  return {
    trackingCode: order.trackingCode,
    quoteRequestId: optional(order.quoteId),
    quoteNo: optional(order.quoteNo),
    companyId,
    userId,
    salesRepresentativeName: optional(order.salesRepresentative),
    dealerUserName: optional(order.dealerUser),
    contactPhone: optional(order.phone),
    contactEmail: optional(order.email),
    status: orderStatus(order.status),
    paymentMethod: paymentMethod(order.paymentStatus),
    paymentStatusText: optional(order.paymentStatus),
    financeApproval: optional(order.financeApproval),
    stockStatusText: optional(order.stockStatus),
    shipmentStatusText: optional(order.shipmentStatus),
    warehouseName: optional(order.warehouse),
    source: optional(order.source),
    currency: order.currency || "TRY",
    subtotalNet: decimal(order.totalAmount),
    grandTotal: decimal(order.totalAmount),
    deliveryAddress: { line1: order.deliveryAddress },
    customerNote: optional(order.customerNote),
    internalNote: optional(order.internalNote),
    statusTimeline: order.history as Prisma.InputJsonValue,
    legacyPayload: order as Prisma.InputJsonValue,
    createdAt: date(order.orderedAt),
    updatedAt: date(order.orderedAt)
  };
}

function notificationData(notification: LegacyNotification, userId: string | null): Prisma.NotificationUncheckedCreateInput {
  return {
    userId,
    recipientType: notification.recipientType,
    recipientKey: notification.recipientKey,
    channel: "PANEL",
    trigger: `legacy.${notification.title}`,
    level: notification.level,
    title: notification.title,
    body: notification.body,
    href: optional(notification.href),
    readAt: nullableDate(notification.readAt),
    metadata: notification as Prisma.InputJsonValue,
    legacyPayload: notification as Prisma.InputJsonValue,
    createdAt: date(notification.createdAt)
  };
}

async function readJson<T>(relativePath: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await readFile(path.join(rootDir, relativePath), "utf8")) as T;
  } catch (error) {
    const code = typeof error === "object" && error !== null && "code" in error ? String(error.code) : "";
    if (code === "ENOENT") {
      return fallback;
    }

    throw error;
  }
}

function segmentName(segment: CustomerSegment): string {
  if (segment === "industrial") return "Sanayi Pro";
  if (segment === "project") return "Kurumsal Proje";
  return "Standart Bayi";
}

function companyStatus(status: CustomerAccount["status"]): "APPROVED" | "PENDING" | "SUSPENDED" {
  if (status === "approved") return "APPROVED";
  if (status === "suspended") return "SUSPENDED";
  return "PENDING";
}

function quoteStatus(status: string): Prisma.QuoteStatus {
  const allowed = ["DRAFT", "SUBMITTED", "ASSIGNED", "PRICED", "APPROVED", "REJECTED", "EXPIRED", "CONVERTED"] as const;
  return allowed.includes(status as Prisma.QuoteStatus) ? (status as Prisma.QuoteStatus) : "SUBMITTED";
}

function orderStatus(status: string): Prisma.OrderStatus {
  const allowed = [
    "DRAFT",
    "PAYMENT_PENDING",
    "APPROVAL_PENDING",
    "DEALER_APPROVAL_PENDING",
    "FINANCE_APPROVAL_PENDING",
    "STOCK_WAITING",
    "PREPARING",
    "PARTIALLY_PREPARING",
    "READY_TO_SHIP",
    "SHIPPED",
    "DELIVERED",
    "PARTIALLY_DELIVERED",
    "CANCELLED",
    "RETURN_REQUESTED",
    "RETURN_APPROVED",
    "RETURN_REJECTED",
    "COMPLETED"
  ] as const;
  return allowed.includes(status as Prisma.OrderStatus) ? (status as Prisma.OrderStatus) : "DRAFT";
}

function paymentMethod(value: string | undefined): Prisma.PaymentMethod | null {
  const normalized = normalize(value ?? "");
  if (!normalized) return null;
  if (normalized.includes("cari") || normalized.includes("open")) return "OPEN_ACCOUNT";
  if (normalized.includes("kart")) return "CREDIT_CARD";
  if (normalized.includes("taksit")) return "INSTALLMENT";
  if (normalized.includes("teklif")) return "QUOTE_PAYMENT";
  return "BANK_TRANSFER";
}

function decimal(value: unknown): Prisma.Decimal {
  const normalized = typeof value === "number" ? String(value) : typeof value === "string" && value.trim() ? value.trim().replace(",", ".") : "0";
  return new Prisma.Decimal(normalized);
}

function nullableDecimal(value: unknown): Prisma.Decimal | null {
  if (value == null || value === "") return null;
  return decimal(value);
}

function date(value: string | undefined): Date {
  const parsed = value ? new Date(value) : new Date();
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

function nullableDate(value: string | undefined): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function optional(value: string | undefined): string | null {
  return value && value.trim() ? value.trim() : null;
}

function normalize(value: string): string {
  return value
    .trim()
    .toLocaleLowerCase("tr-TR")
    .replace(/[ç]/g, "c")
    .replace(/[ğ]/g, "g")
    .replace(/[ı]/g, "i")
    .replace(/[ö]/g, "o")
    .replace(/[ş]/g, "s")
    .replace(/[ü]/g, "u");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await disconnectDatabase();
  });
