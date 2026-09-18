import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { createEmptyCatalogStore, type CatalogProductRecord } from "@entas/catalog";
import type { CustomerAccount } from "./customer-auth";
import type { AdminOrder, DeletedOrderRecord } from "./commercial-repository";

// Yalnız Next.js istek bağlamı taklit edilir; hesap, katalog, fiyat, sipariş ve bildirim depoları gerçektir.
vi.mock("server-only", () => ({}));
const context = vi.hoisted(() => ({ cookies: new Map<string, string>() }));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (name: string) => (context.cookies.has(name) ? { value: context.cookies.get(name)! } : undefined) }),
  headers: async () => new Headers({ "x-forwarded-for": "127.0.0.1" })
}));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`);
  },
  notFound: () => {
    throw new Error("NOT_FOUND");
  }
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const secret = "isolated-admin-order-management-secret-2026";
const baseProduct: CatalogProductRecord = {
  id: "supplier:catalog-pdf-entas-bk-baki-koc-2026-09:101",
  sourceKey: "catalog-pdf-entas-bk-baki-koc-2026-09",
  sourceName: "Baki Koç 2026",
  externalId: "101",
  sku: "BK-101",
  slug: "bilezikli-plastik-gelberi-101",
  name: "Bilezikli Plastik Gelberi - 101",
  brand: "BAKİ KOÇ",
  categoryPath: ["Tarım & Bahçe El Aletleri", "Plastik Kürek Grubu"],
  category: "Plastik Kürek Grubu",
  unitType: "ADET",
  taxRate: "20",
  currency: "TRY",
  listPrice: "87.60",
  stockQuantity: 1,
  stockStatus: "in_stock",
  stockQuantityKnown: false,
  status: "ACTIVE",
  isVisible: true,
  priceApprovalStatus: "APPROVED",
  priceDisplayMode: "HIDDEN_UNTIL_DEALER",
  importedAt: "2026-09-18T00:00:00Z",
  createdAt: "2026-09-18T00:00:00Z",
  updatedAt: "2026-09-18T00:00:00Z"
};
const hoe: CatalogProductRecord = { ...baseProduct, id: "bk-313", externalId: "313", sku: "BK-313", slug: "capa-313", name: "Büyük Özel Çatallı Çapa - 313", listPrice: "156.00" };
const pickaxe: CatalogProductRecord = { ...baseProduct, id: "bk-703", externalId: "703", sku: "BK-703", slug: "kazma-703", name: "2 kg Çelik Baltalı Kazma - 703", listPrice: "648.00" };
const hidden: CatalogProductRecord = { ...baseProduct, id: "bk-hidden", externalId: "999", sku: "BK-999", slug: "gizli", name: "Pasif ürün", status: "PASSIVE", isVisible: false };

let dir: string;
let auth: typeof import("./customer-auth");
let adminAuth: typeof import("./admin-auth");
let commercial: typeof import("./commercial-repository");
let orderActions: typeof import("../app/admin/orders/actions");
let notifications: typeof import("./notification-repository");
let dealer: CustomerAccount;

beforeAll(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "entas-admin-orders-"));
  await mkdir(path.join(dir, "data"));
  await writeFile(path.join(dir, "pnpm-workspace.yaml"), "packages: []\n");
  const store = createEmptyCatalogStore("2026-09-18T00:00:00Z");
  store.products = [baseProduct, hoe, pickaxe, hidden];
  await writeFile(path.join(dir, "data/catalog-store.json"), JSON.stringify(store));
  vi.stubEnv("AUTH_SECRET", secret);
  vi.stubEnv("ADMIN_SESSION_SECRET", secret);
  vi.stubEnv("ADMIN_EMAIL", "admin@example.test");
  vi.stubEnv("ENTAS_COMMERCIAL_DATA_DIR", path.join(dir, "data"));
  const cwd = vi.spyOn(process, "cwd").mockReturnValue(dir);
  auth = await import("./customer-auth");
  adminAuth = await import("./admin-auth");
  commercial = await import("./commercial-repository");
  orderActions = await import("../app/admin/orders/actions");
  notifications = await import("./notification-repository");
  cwd.mockRestore();
  dealer = await auth.createCustomerAccount({
    id: "dealer-kaya",
    email: "kaya@example.test",
    companyName: "Kaya Yapı",
    authorizedPerson: "Ali Kaya",
    phone: "05320000000",
    city: "Nevşehir",
    deliveryAddress: "İzole test teslimat adresi",
    status: "approved",
    segment: "standard",
    baseDiscountRate: 0,
    brandDiscounts: {},
    categoryDiscounts: {},
    specialNetPrices: {},
    plainPassword: "Isolated-Test-2026!",
    referral: { sellerId: "seller-eren", sellerName: "Eren", code: "ENT-TEST", linkedAt: "2026-09-01T00:00:00Z", source: "code" }
  });
  context.cookies.set(adminAuth.ADMIN_COOKIE, adminAuth.createAdminSession());
});

afterAll(async () => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  if (dir) await rm(dir, { recursive: true, force: true });
});

function formData(values: Record<string, string | string[]>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) {
    for (const entry of Array.isArray(value) ? value : [value]) data.append(key, entry);
  }
  return data;
}

async function createOrder(lines: Array<{ productId: string; quantity: number }>, paymentMode = "account"): Promise<AdminOrder> {
  const redirect = await orderActions
    .createAdminOrderAction({}, formData({ customerId: dealer.id, lines: JSON.stringify(lines), paymentMode, deliveryAddress: "Depo teslim" }))
    .then((state) => {
      throw new Error(`Beklenen yönlendirme yerine durum döndü: ${JSON.stringify(state)}`);
    })
    .catch((error: Error) => error.message);
  expect(redirect).toMatch(/^REDIRECT:\/admin\/orders\/order-.+\?created=1$/);
  const id = decodeURIComponent(redirect.replace("REDIRECT:/admin/orders/", "").replace("?created=1", ""));
  return (await commercial.getAdminOrderById(id))!;
}

describe("admin order management (isolated real stores)", () => {
  it("creates a direct order at the dealer's catalog price with a shareable card payment state", async () => {
    const order = await createOrder([{ productId: baseProduct.id, quantity: 5 }, { productId: hoe.id, quantity: 1 }], "card");

    expect(order.orderNo).toMatch(/^SIP-\d{8}-0001$/);
    expect(order.trackingCode).toMatch(/^S[A-F0-9]{32}$/);
    expect(order.status).toBe("PAYMENT_PENDING");
    expect(order.paymentStatus).toBe("Kart ödemesi bekleniyor");
    expect(order.source).toBe("Admin siparişi");
    expect(order.items.map((item) => [item.sku, item.quantity, item.unitPrice, item.lineTotal])).toEqual([
      ["BK-101", 5, "87.60", "438.00"],
      ["BK-313", 1, "156.00", "156.00"]
    ]);
    expect(order.totalAmount).toBe("594.00");
    expect(order.deliveryAddress).toBe("Depo teslim");
    expect(order.sellerCommission?.lines.map((line) => line.saleCents)).toEqual([43800, 15600]);
    const inbox = await notifications.listCustomerNotifications(dealer.email);
    expect(inbox.some((entry) => entry.title === "Siparişiniz oluşturuldu" && entry.href === `/orders/${order.trackingCode}`)).toBe(true);
  });

  it("rejects unpublished products and unknown dealers without creating an order", async () => {
    const before = (await commercial.searchAdminOrders({ limit: 100 })).total;
    await expect(
      orderActions.createAdminOrderAction({}, formData({ customerId: dealer.id, lines: JSON.stringify([{ productId: hidden.id, quantity: 1 }]), paymentMode: "account" }))
    ).resolves.toEqual({ error: "BK-999 yayında değil; siparişe eklenemez." });
    await expect(
      orderActions.createAdminOrderAction({}, formData({ customerId: "missing", lines: JSON.stringify([{ productId: hoe.id, quantity: 1 }]), paymentMode: "account" }))
    ).resolves.toEqual({ error: "Seçilen bayi hesabı bulunamadı." });
    expect((await commercial.searchAdminOrders({ limit: 100 })).total).toBe(before);
  });

  it("edits quantities, removes and adds lines, and rebuilds totals and commission", async () => {
    const order = await createOrder([{ productId: baseProduct.id, quantity: 5 }, { productId: hoe.id, quantity: 2 }]);
    const [gelberi, capa] = order.items;
    const state = await orderActions.updateOrderItemsAction(
      {},
      formData({
        orderId: order.id,
        changes: JSON.stringify([{ itemId: gelberi!.id, quantity: 10 }, { itemId: capa!.id, quantity: 0 }]),
        additions: JSON.stringify([{ productId: pickaxe.id, quantity: 2 }]),
        note: "Müşteri telefonla değiştirdi"
      })
    );
    expect(state).toEqual({ message: "Sipariş güncellendi. Yeni toplam: 2172.00 TRY." });

    const updated = (await commercial.getAdminOrderById(order.id))!;
    expect(updated.items.map((item) => [item.sku, item.quantity, item.lineTotal])).toEqual([
      ["BK-101", 10, "876.00"],
      ["BK-703", 2, "1296.00"]
    ]);
    expect(updated.totalAmount).toBe("2172.00");
    expect(updated.sellerCommission?.lines.map((line) => [line.itemId, line.saleCents])).toEqual(updated.items.map((item) => [item.id, Math.round(Number(item.lineTotal) * 100)]));
    expect(updated.history[0]?.message).toContain("BK-313 çıkarıldı");
    expect(updated.history[0]?.message).toContain("Not: Müşteri telefonla değiştirdi");
  });

  it("keeps operation notes and payment references out of the customer-visible history", async () => {
    const order = await createOrder([{ productId: hoe.id, quantity: 1 }], "card");
    await commercial.updateOrderOperation(
      { orderId: order.id, status: "APPROVAL_PENDING", paymentStatus: "Kartla ödendi (ZiraatPay)", internalNote: "ZiraatPay 3D ödemesi onaylandı. İşlem ref: gizli-oturum-42" },
      "ZiraatPay"
    );
    const updated = (await commercial.getAdminOrderById(order.id))!;
    expect(updated.history[0]).toMatchObject({ message: "Sipariş operasyon bilgileri güncellendi.", internalNote: "ZiraatPay 3D ödemesi onaylandı. İşlem ref: gizli-oturum-42" });

    const { customerOrderHistory } = await import("./order-history-view");
    const visible = JSON.stringify(customerOrderHistory(updated.history));
    expect(visible).not.toContain("gizli-oturum-42");
    expect(visible).not.toContain("admin@example.test");
    expect(visible).toContain("Sipariş durumu güncellendi: Onay bekliyor.");
    expect(visible).toContain(`${dealer.companyName} adına oluşturuldu`);
  });

  it("refuses item edits once payment is collected", async () => {
    const order = await createOrder([{ productId: hoe.id, quantity: 1 }]);
    await commercial.updateOrderOperation({ orderId: order.id, paymentStatus: "Ödendi" }, "admin@example.test");
    const state = await orderActions.updateOrderItemsAction(
      {},
      formData({ orderId: order.id, changes: JSON.stringify([{ itemId: order.items[0]!.id, quantity: 3 }]), additions: "[]" })
    );
    expect(state.error).toContain("Tahsilatı yapılmış");
    expect((await commercial.getAdminOrderById(order.id))!.items[0]!.quantity).toBe(1);
  });

  it("hides rejected orders from the active list and archives them on delete without reusing order numbers", async () => {
    const rejected = await createOrder([{ productId: hoe.id, quantity: 1 }]);
    const active = await createOrder([{ productId: hoe.id, quantity: 1 }]);
    await commercial.updateOrderOperation({ orderId: rejected.id, status: "CANCELLED", financeApproval: "Reddedildi" }, "admin@example.test");

    const activeIds = (await commercial.searchAdminOrders({ view: "active", limit: 100 })).items.map((order) => order.id);
    const rejectedIds = (await commercial.searchAdminOrders({ view: "rejected", limit: 100 })).items.map((order) => order.id);
    expect(activeIds).toContain(active.id);
    expect(activeIds).not.toContain(rejected.id);
    expect(rejectedIds).toEqual([rejected.id]);

    const redirect = await orderActions
      .deleteRejectedOrdersAction(formData({ orderId: [rejected.id, active.id] }))
      .then(() => "")
      .catch((error: Error) => error.message);
    expect(redirect).toContain("REDIRECT:/admin/orders?view=rejected");
    const result = new URLSearchParams(redirect.split("?")[1]);
    expect(result.get("ok")).toBe("1 reddedilen sipariş listeden silindi.");
    expect(result.get("error")).toBe(`${active.orderNo}: Yalnızca reddedilen veya iptal edilen siparişler silinebilir.`);

    expect(await commercial.getAdminOrderById(rejected.id)).toBeNull();
    expect(await commercial.getAdminOrderById(active.id)).not.toBeNull();
    const archive = JSON.parse(await readFile(path.join(dir, "data/orders-deleted.json"), "utf8")) as DeletedOrderRecord[];
    expect(archive.map((order) => [order.id, order.deletedBy])).toEqual([[rejected.id, "admin@example.test"]]);

    const next = await createOrder([{ productId: hoe.id, quantity: 1 }]);
    const sequence = (orderNo: string) => Number(orderNo.split("-").pop());
    expect(sequence(next.orderNo)).toBeGreaterThan(Math.max(sequence(rejected.orderNo), sequence(active.orderNo)));
  });
});
