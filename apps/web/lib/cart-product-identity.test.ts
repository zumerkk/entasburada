import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createEmptyCatalogStore, type CatalogProductRecord } from "@entas/catalog";
import type { CustomerAccount } from "./customer-auth";
import type { AdminQuote } from "./commercial-repository";

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }), headers: async () => new Headers() }));
vi.mock("./order-alerts", () => ({ queueNewOrderAlert: vi.fn() }));

const now = "2026-10-12T07:00:00Z";
const base: CatalogProductRecord = {
  id: "heater", sourceKey: "test", sourceName: "Isolated catalog", externalId: "heater",
  sku: "191", slug: "webasto-isitici", name: "MUR-CELL Webasto Dizel Isıtıcı Elektrikli 220V+12/24V",
  brand: "TEST", category: "Test", categoryPath: ["Test"], unitType: "Adet", taxRate: "20", currency: "TRY",
  listPrice: "5000.00", stockQuantity: 1000, stockStatus: "in_stock", status: "ACTIVE", isVisible: true,
  priceApprovalStatus: "APPROVED", priceDisplayMode: "HIDDEN_UNTIL_DEALER", importedAt: now, createdAt: now, updatedAt: now
};
const saw = { ...base, id: "saw", externalId: "saw", slug: "mrsmax-testere", name: "MRSMAX EKO SERİSİ BENZİNLİ ZİNCİRLİ TESTERESİ PR-GS5200A", listPrice: "2000.00" };
const distributor = { ...base, id: "distributor", externalId: "distributor", sku: "5202", slug: "sayim-ikili-dagitici", name: "SAYIM 2’LI DAĞITICI", listPrice: "40.00" };
const drill = { ...base, id: "drill", externalId: "drill", sku: "5202", slug: "elmas-matkap-ucu-7x100", name: "TRICRAFT Elmas Matkap Ucu 7x100", listPrice: "100.00" };

let dir: string;
let customer: CustomerAccount;
let cart: typeof import("./cart-repository");
let commercial: typeof import("./commercial-repository");
let checkout: typeof import("./cart-checkout");

beforeAll(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "entas-cart-identity-"));
  await mkdir(path.join(dir, "data"));
  await writeFile(path.join(dir, "pnpm-workspace.yaml"), "packages: []\n");
  const store = createEmptyCatalogStore(now);
  // The wrong product intentionally precedes the intended product, matching the reported failure.
  store.products = [base, saw, distributor, drill];
  await writeFile(path.join(dir, "data/catalog-store.json"), JSON.stringify(store));
  vi.stubEnv("AUTH_SECRET", "isolated-cart-identity-secret-2026");
  vi.stubEnv("ENTAS_CART_DATA_DIR", path.join(dir, "data"));
  vi.stubEnv("ENTAS_COMMERCIAL_DATA_DIR", path.join(dir, "data"));
  const cwd = vi.spyOn(process, "cwd").mockReturnValue(dir);
  const auth = await import("./customer-auth");
  cart = await import("./cart-repository");
  commercial = await import("./commercial-repository");
  checkout = await import("./cart-checkout");
  cwd.mockRestore();
  customer = await auth.createCustomerAccount({
    id: "test-dealer", email: "dealer@example.test", companyName: "Identity Test Dealer", authorizedPerson: "Test Buyer",
    phone: "05320000000", city: "İstanbul", deliveryAddress: "Isolated test delivery address", status: "approved", segment: "standard",
    baseDiscountRate: 0, brandDiscounts: {}, categoryDiscounts: {}, specialNetPrices: {}, plainPassword: "Isolated-Test-2026!"
  });
});
beforeEach(async () => { await cart.clearCart(customer); });
afterAll(async () => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  if (dir) await rm(dir, { recursive: true, force: true });
});

function identity(product: CatalogProductRecord, quantity = 1) {
  return { catalogProductId: product.id, productSlug: product.slug, sku: product.sku, productName: product.name, quantity };
}
function quoteInput(items: AdminQuote["items"] | Array<{ sku?: string; productName?: string; catalogProductId?: string; productSlug?: string }>) {
  return { companyTitle: customer.companyName, authorizedPerson: customer.authorizedPerson, phone: customer.phone, email: customer.email, items };
}

describe("persisted cart product identity through checkout", () => {
  it("keeps a drill bit and a different product with the same SKU separate, with their own prices", async () => {
    await cart.addCartItems(customer, [identity(drill, 2), identity(distributor, 3), identity(saw)], { catalogOnly: true });
    const before = await cart.loadPricedCart(customer);
    expect(before.items.map((item) => [item.catalogProductId, item.productName, item.unitNetPrice])).toEqual([
      [drill.id, drill.name, "100.00"], [distributor.id, distributor.name, "40.00"], [saw.id, saw.name, "2000.00"]
    ]);
    const order = await checkout.createOrderFromCustomerCart(customer);
    expect(order.items.map((item) => [item.catalogProductId, item.productSlug, item.productName, item.unitPrice, item.quantity])).toEqual([
      [drill.id, drill.slug, drill.name, "100.00", 2], [distributor.id, distributor.slug, distributor.name, "40.00", 3], [saw.id, saw.slug, saw.name, "2000.00", 1]
    ]);
    const quotes = JSON.parse(await readFile(path.join(dir, "data/quotes.json"), "utf8")) as AdminQuote[];
    const quote = quotes.find((entry) => entry.id === order.quoteId)!;
    expect(quote.items.map((item) => [item.catalogProductId, item.productSlug, item.quotedUnitPrice])).toEqual([
      [drill.id, drill.slug, "100.00"], [distributor.id, distributor.slug, "40.00"], [saw.id, saw.slug, "2000.00"]
    ]);
    expect(order.totalAmount).toBe("2320.00");
    expect((await cart.loadCustomerCart(customer)).items).toHaveLength(0);
  });

  it("rejects mismatched and removed product identities without writing a different cart product", async () => {
    await expect(cart.addCartItems(customer, [{ ...identity(drill), productSlug: distributor.slug }], { catalogOnly: true })).rejects.toThrow();
    await expect(cart.addCartItems(customer, [{ ...identity(drill), catalogProductId: "removed" }])).rejects.toThrow();
    await expect(cart.addCartItems(customer, [{ sku: "5202", quantity: 1 }], { catalogOnly: true })).rejects.toThrow();
    expect((await cart.loadCustomerCart(customer)).items).toHaveLength(0);
  });

  it("resolves a legacy SKU plus exact name and upgrades its identity", async () => {
    await cart.addCartItems(customer, [{ sku: saw.sku, productName: saw.name, quantity: 1 }], { catalogOnly: true });
    expect((await cart.loadCustomerCart(customer)).items[0]).toMatchObject({ catalogProductId: saw.id, productSlug: saw.slug, productName: saw.name });
    const quote = await checkout.createQuoteFromCustomerCart(customer);
    expect(quote.items[0]).toMatchObject({ catalogProductId: saw.id, productSlug: saw.slug, productName: saw.name, quotedUnitPrice: "2000.00" });
  });

  it("leaves ambiguous legacy cart lines unpriced and blocks direct ordering", async () => {
    await cart.addCartItems(customer, [{ sku: "5202", quantity: 1 }]);
    const priced = await cart.loadPricedCart(customer);
    expect(priced.items[0]).toMatchObject({ sku: "5202", productName: "5202", priceAvailable: false, unitNetPrice: "0.00" });
    expect(priced.items[0]?.catalogProductId).toBeUndefined();
    await expect(checkout.createOrderFromCustomerCart(customer)).rejects.toThrow("fiyat teyidi");
  });

  it("does not rebind a stale saved cart identity using its still-valid SKU or name", async () => {
    await writeFile(path.join(dir, "data/carts.json"), JSON.stringify([{ customerId: customer.id, updatedAt: now, items: [{
      id: "stale", ...identity(drill), catalogProductId: "removed", unit: "Adet", addedAt: now
    }] }]));
    const priced = await cart.loadPricedCart(customer);
    expect(priced.items[0]).toMatchObject({ productName: drill.name, catalogProductId: "removed", priceAvailable: false });
    expect(priced.canCreateOrder).toBe(false);
    await expect(checkout.createQuoteFromCustomerCart(customer)).rejects.toThrow("ürün kimliği");
  });

  it("keeps ambiguous and partial custom quote rows unchanged, and rejects contradictory selected quote products", async () => {
    const quote = await commercial.createQuote(quoteInput([{ sku: "5202" }, { productName: "Matkap Ucu" }, { sku: "7x100" }]));
    expect(quote.items.map((item) => [item.sku, item.productName, item.catalogProductId, item.productSlug, item.catalogListPrice])).toEqual([
      ["5202", "5202", undefined, undefined, undefined], ["OZEL-URUN", "Matkap Ucu", undefined, undefined, undefined], ["7x100", "7x100", undefined, undefined, undefined]
    ]);
    await expect(commercial.createQuote(quoteInput([{ ...identity(drill), productSlug: distributor.slug }]))).rejects.toThrow("ürün kimliği");
  });
});
