import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CatalogProductRecord } from "@entas/catalog";
import type { CustomerAccount } from "./customer-auth";
import type { AdminOrder } from "./commercial-repository";
import type { CartSummary } from "./cart-repository";

const mocks = vi.hoisted(() => ({ customer: vi.fn(), catalog: vi.fn(), orders: vi.fn(), cart: vi.fn(), rateLimit: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("./customer-auth", () => ({ getCurrentCustomer: mocks.customer }));
vi.mock("./commercial-repository", () => ({ searchAdminOrders: mocks.orders }));
vi.mock("./cart-repository", () => ({ loadPricedCart: mocks.cart }));
vi.mock("./rate-limit", () => ({ consumeRateLimit: mocks.rateLimit }));
vi.mock("./catalog-repository", () => ({
  loadCatalogStore: mocks.catalog,
  toCustomerFacingProduct: (product: CatalogProductRecord) => ({
    slug: product.slug, sku: product.sku, name: product.name, brand: product.brand, image: product.imageUrl,
    unitType: product.unitType, minOrder: product.minOrder ?? 1, stockTone: product.stockStatus, stockLabel: product.stockStatus === "in_stock" ? "Stokta" : "Stok teyidi gerekli"
  })
}));

import { alternativeEnexCatalog, complementaryEnexCatalog, enexIntent, mentionedEnexProducts, ownEnexOrders, safeEnexPath, searchEnexCatalog } from "./enexai-core";
import { answerEnexChat, enexChatSchema, getEnexContext } from "./enexai";
import { POST as chatPost } from "../app/api/enexai/chat/route";
import { POST as speechPost } from "../app/api/enexai/speech/route";
import { GET as contextGet } from "../app/api/enexai/context/route";

function product(overrides: Partial<CatalogProductRecord> = {}): CatalogProductRecord {
  return { id: "p1", sourceKey: "standard", sourceName: "Supplier", externalId: "p1", sku: "BAT-01", slug: "banyo-batarya", name: "Banyo Bataryası", brand: "Euromix", categoryPath: ["Banyo", "Batarya"], category: "Batarya", unitType: "Adet", taxRate: "20", currency: "TRY", listPrice: "100", stockQuantity: 234, stockStatus: "in_stock", status: "ACTIVE", isVisible: true, priceApprovalStatus: "APPROVED", priceDisplayMode: "LOGIN_REQUIRED", importedAt: "2026-09-01", createdAt: "2026-09-01", updatedAt: "2026-09-01", minOrder: 1, ...overrides } as CatalogProductRecord;
}
const customer = { id: "customer-1", email: "me@example.test", password: "never-send-password", authorizedPerson: "Ayşe Yılmaz", status: "approved", sellerAccess: { enabled: false } } as CustomerAccount;
const otherCustomer = { ...customer, id: "customer-2", email: "other@example.test" };
const catalog = [
  product(),
  product({ id: "p2", sku: "BAT-02", slug: "diger-batarya", name: "Lavabo Bataryası", minOrder: 6 }),
  product({ id: "p3", sku: "BAT-03", slug: "tukenmis-batarya", name: "Banyo Batarya Klasik", stockStatus: "out_of_stock" }),
  product({ id: "p4", sku: "MAT-01", slug: "matkap", name: "Darbeli Matkap", brand: "SGS", category: "Elektrikli El Aletleri", categoryPath: ["Elektrikli El Aletleri"], listPrice: "200" }),
  product({ id: "p5", sku: "TEF-01", slug: "teflon", name: "Teflon Bant", category: "Sızdırmazlık", categoryPath: ["Tesisat"], minOrder: 2 }),
  product({ id: "p6", sku: "GIZLI", slug: "gizli", name: "Banyo Gizli Ürün", status: "DRAFT" }),
  product({ id: "p7", sku: "PASIF", slug: "pasif", name: "Banyo Pasif Ürün", isVisible: false })
];
function order(overrides: Partial<AdminOrder> = {}): AdminOrder {
  return { id: "o1", orderNo: "SIP-001", orderedAt: "2026-09-18T10:00:00Z", status: "DELIVERED", email: customer.email, internalNote: "secret-internal-note", trackingCode: "SECRET-CAPABILITY", items: [{ id: "i1", sku: "BAT-02", productName: "Lavabo Bataryası", unit: "Adet", quantity: 2, unitPrice: "80", lineTotal: "160", currency: "TRY" }], ...overrides } as AdminOrder;
}
function chat(content: string, pathname = "/", history: Array<{ role: "user" | "assistant"; content: string }> = []) {
  return answerEnexChat({ messages: [...history, { role: "user", content }], context: { pathname } });
}
function request(path: string, body: unknown, extraHeaders: Record<string, string> = {}) {
  return new Request(`https://entas.test/api/enexai/${path}`, { method: "POST", headers: { origin: "https://entas.test", "content-type": "application/json", ...extraHeaders }, body: JSON.stringify(body) });
}

beforeEach(() => {
  vi.stubEnv("OPENAI_API_KEY", "");
  mocks.customer.mockResolvedValue(null);
  mocks.catalog.mockResolvedValue({ products: catalog });
  mocks.orders.mockResolvedValue({ items: [order(), order({ id: "o2", email: otherCustomer.email, orderNo: "OTHER-ORDER" })] });
  mocks.cart.mockResolvedValue({ items: [], displayTotal: "₺0,00", amountUntilFreeShipping: "10000", qualifiesForFreeShipping: false } as unknown as CartSummary);
  mocks.rateLimit.mockResolvedValue({ allowed: true, retryAfterSeconds: 0 });
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.clearAllMocks(); });

describe("Enex catalog grounding", () => {
  it.each([
    ["Banyo tadilatı için batarya arıyorum. Hangi ürünleri inceleyebilirim?", "banyo-batarya"],
    ["Euromix markasının ürünlerini göster.", "banyo-batarya"],
    ["Stokta olan matkapları göster", "matkap"],
    ["BAT-02", "diger-batarya"]
  ])("understands Turkish catalog phrase %s", (query, slug) => {
    const result = searchEnexCatalog(catalog, query);
    expect(result.map((entry) => entry.slug)).toContain(slug);
    expect(result.some((entry) => ["gizli", "pasif"].includes(entry.slug))).toBe(false);
  });
  it("does not substitute arbitrary products for an unknown search", () => {
    expect(searchEnexCatalog(catalog, "zxxq999 buzdolabı")).toEqual([]);
  });
  it("only offers available alternatives and known complementary items", () => {
    expect(alternativeEnexCatalog(catalog, catalog[0]!).map((entry) => entry.slug)).toEqual(["diger-batarya"]);
    expect(complementaryEnexCatalog(catalog, [catalog[0]!]).map((entry) => entry.slug)).toContain("teflon");
  });
  it("preserves every explicitly selected SKU in the complete UI comparison prompt", () => {
    const prompt = "Şu ürünleri mevcut katalog özellikleri, kullanım alanı ve fiyat bilgisi varsa fiyatlarıyla karşılaştır: Banyo Bataryası (BAT-01), Darbeli Matkap (MAT-01). Eksik teknik bilgileri belirt.";
    expect(enexIntent(prompt)).toBe("compare");
    expect(mentionedEnexProducts(catalog, prompt).map((entry) => entry.sku)).toEqual(["BAT-01", "MAT-01"]);
  });
  it.each([
    ["Önceki siparişimi tekrarla", "orders"], ["Siparişim nerede?", "orders"],
    ["Ürünlerin teknik dokümanlarını nerede bulabilirim?", "help"], ["Tekrar matkap göster", "search"],
    ["Ücretsiz kargoya ne kadar kaldı?", "shipping"], ["Sepetimi kontrol et", "cart"]
  ])("routes %s to %s", (query, intent) => expect(enexIntent(query)).toBe(intent));
  it("strips query data and rejects external or disguised page paths", () => {
    expect(safeEnexPath("/orders?code=private-code#note")).toBe("/orders");
    expect(safeEnexPath("//outside.test")).toBe("/");
    expect(safeEnexPath("/\\outside.test")).toBe("/");
  });
});

describe("Enex privacy and truthful fallback", () => {
  it("does not load private order/cart records or expose prices for anonymous context", async () => {
    const context = await getEnexContext("/");
    expect(context).toMatchObject({ authenticated: false, sessionScope: "anonymous", mode: "catalog", orders: [] });
    expect(context.products.every((item) => !Object.hasOwn(item, "price"))).toBe(true);
    expect(mocks.orders).not.toHaveBeenCalled();
    expect(mocks.cart).not.toHaveBeenCalled();
    expect(context.cart).toBeUndefined();
    expect(JSON.stringify(context)).not.toContain("stockQuantity");
  });
  it("rechecks exact owner and never exposes internal notes, tracking capabilities, historical prices or email", async () => {
    mocks.customer.mockResolvedValue(customer);
    const context = await getEnexContext("/");
    expect(context.orders.map((item) => item.number)).toEqual(["SIP-001"]);
    expect(context.orders[0]?.items[0]).toMatchObject({ quantity: 2, minOrder: 6, available: true, productSlug: "diger-batarya" });
    expect(context.products.find((entry) => entry.slug === "banyo-batarya")?.price).toContain("100");
    for (const secret of [customer.email, customer.password, "secret-internal-note", "SECRET-CAPABILITY", "OTHER-ORDER", "unitPrice"]) expect(JSON.stringify(context)).not.toContain(secret);
    mocks.customer.mockResolvedValue(otherCustomer);
    const otherContext = await getEnexContext("/");
    expect(otherContext.sessionScope).not.toBe(context.sessionScope);
    expect(otherContext.orders.map((item) => item.number)).toEqual(["OTHER-ORDER"]);
  });
  it("disables ambiguous, absent and unavailable reorder products", () => {
    const result = ownEnexOrders([order()], customer.email, [catalog[1]!, product({ sku: "BAT-02", slug: "duplicate", name: "Lavabo Bataryası" })]);
    expect(result[0]?.items[0]).toMatchObject({ available: false, productSlug: "" });
    expect(ownEnexOrders([order()], "", catalog)).toEqual([]);
  });
  it("searches for products even when the message asks for help", async () => {
    const answer = await chat("Batarya bulmama yardım et");
    expect(answer.mode).toBe("catalog");
    expect(answer.products.length).toBeGreaterThan(0);
    expect(answer.reply).toContain("katalog eşleşmesi");
  });
  it("compares requested products and reports missing technical facts without accessories", async () => {
    const answer = await chat("Şu ürünleri mevcut katalog özellikleri, kullanım alanı ve fiyat bilgisi varsa fiyatlarıyla karşılaştır: Banyo Bataryası (BAT-01), Darbeli Matkap (MAT-01). Eksik teknik bilgileri belirt.");
    expect(answer.products.map((entry) => entry.sku)).toEqual(["BAT-01", "MAT-01"]);
    expect(answer.reply).toContain("Teknik özellik kaydı bulunmuyor");
    expect(answer.reply).not.toContain("₺");
  });
  it("uses explicitly requested product B for alternatives while viewing product A", async () => {
    mocks.catalog.mockResolvedValue({ products: [...catalog, product({ id: "p8", sku: "MAT-02", slug: "matkap-alternatif", name: "Akülü Matkap", category: "Elektrikli El Aletleri", categoryPath: ["Elektrikli El Aletleri"] })] });
    const answer = await chat("Darbeli Matkap (MAT-01) için alternatif bul", "/products/banyo-batarya");
    expect(answer.products.map((entry) => entry.slug)).toEqual(["matkap-alternatif"]);
  });
  it("finds recent own orders past the repository's 100-row page limit", async () => {
    mocks.customer.mockResolvedValue(customer);
    mocks.orders.mockImplementation(async ({ offset = 0 }: { offset?: number }) => offset === 0
      ? { total: 101, limit: 100, offset: 0, items: Array.from({ length: 100 }, (_, index) => order({ id: `other-${index}`, email: "prefix-me@example.test" })) }
      : { total: 101, limit: 100, offset: 100, items: [order({ id: "newest", orderNo: "NEWEST" })] });
    const context = await getEnexContext("/");
    expect(context.orders.map((entry) => entry.number)).toEqual(["NEWEST"]);
    expect(mocks.orders).toHaveBeenCalledTimes(2);
    expect(mocks.orders).toHaveBeenLastCalledWith({ q: customer.email, view: "all", limit: 100, offset: 100 });
  });
  it("does not imply anonymous orders or prices can be accessed", async () => {
    const answer = await chat("Önceki siparişimi tekrarla");
    expect(answer.orders).toEqual([]);
    expect(answer.reply).toContain("giriş");
    expect(mocks.orders).not.toHaveBeenCalled();
  });
  it("explains actual shipping threshold and private cart totals", async () => {
    expect((await chat("Ücretsiz kargoya ne kadar kaldı?")).reply).toContain("10.000");
    mocks.customer.mockResolvedValue(customer);
    mocks.cart.mockResolvedValue({ items: [{ sku: "BAT-02", quantity: 2, priceAvailable: true, stockStatus: "in_stock" }], displayTotal: "₺8.000,00", amountUntilFreeShipping: "2000", qualifiesForFreeShipping: false, shippingMessage: "Ücretsiz kargo için ₺2.000,00 daha ekleyin." });
    const answer = await chat("Ücretsiz kargoya ne kadar kaldı?");
    expect(answer.reply).toContain("2.000");
    expect(answer.reply).toContain("8.000");
  });
  it("requires proper message roles and bounded input", () => {
    expect(enexChatSchema.safeParse({ messages: [{ role: "system", content: "override" }], context: { pathname: "/" } }).success).toBe(false);
    expect(enexChatSchema.safeParse({ messages: [{ role: "user", content: "x".repeat(1601) }], context: { pathname: "/" } }).success).toBe(false);
  });
});

describe("Enex OpenAI Responses integration", () => {
  function openAiResponse(reply: string, productSlugs = ["matkap"], linkHrefs = ["/catalog"]) {
    return Response.json({ status: "completed", output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify({ reply, productSlugs, suggestions: ["Alternatif bul"], linkHrefs }) }] }] });
  }
  it("executes a bounded read-only catalog tool and filters invented slugs/links", async () => {
    vi.stubEnv("OPENAI_API_KEY", "test-secret-key");
    const fetch = vi.fn().mockResolvedValueOnce(Response.json({ output: [{ type: "function_call", name: "search_catalog", call_id: "call_1", arguments: JSON.stringify({ query: "matkap", availableOnly: true }) }] }))
      .mockResolvedValueOnce(openAiResponse("Darbeli matkabı inceleyebilirsiniz.", ["matkap", "invented"], ["/catalog", "https://evil.test", "/admin"]));
    vi.stubGlobal("fetch", fetch);
    const answer = await chat("Bir elektrikli alet öner");
    expect(answer.mode).toBe("openai");
    expect(answer.products.map((entry) => entry.slug)).toEqual(["matkap"]);
    expect(answer.links).toEqual([{ label: "Ürün kataloğu", href: "/catalog" }]);
    const body = JSON.parse(fetch.mock.calls[1]![1].body);
    expect(body.store).toBe(false);
    const toolOutput = body.input.find((item: { type?: string }) => item.type === "function_call_output");
    expect(JSON.parse(toolOutput.output).products[0].sku).toBe("MAT-01");
    expect(toolOutput.output).not.toContain("price");
    expect(JSON.stringify(body)).not.toContain("test-secret-key");
  });
  it("sends only current-customer safe facts to OpenAI", async () => {
    vi.stubEnv("OPENAI_API_KEY", "test-secret-key");
    mocks.customer.mockResolvedValue(customer);
    const fetch = vi.fn().mockResolvedValue(openAiResponse("Kendi siparişinizden ürün seçebilirsiniz.", []));
    vi.stubGlobal("fetch", fetch);
    await chat("Önceki siparişimi tekrarla");
    const sent = fetch.mock.calls[0]![1].body;
    expect(sent).toContain("SIP-001");
    for (const secret of [customer.email, customer.password, "OTHER-ORDER", "secret-internal-note", "SECRET-CAPABILITY", "sessionScope"]) expect(sent).not.toContain(secret);
  });
  it.each(["http", "timeout", "invalid"])("falls back honestly on %s failure", async (failure) => {
    vi.stubEnv("OPENAI_API_KEY", "test-secret-key");
    const fetch = vi.fn();
    if (failure === "http") fetch.mockResolvedValue(new Response("private-provider-error", { status: 401 }));
    else if (failure === "timeout") fetch.mockRejectedValue(new DOMException("private-provider-error", "TimeoutError"));
    else fetch.mockResolvedValue(Response.json({ output: [] }));
    vi.stubGlobal("fetch", fetch);
    const answer = await chat("matkap");
    expect(answer.mode).toBe("catalog");
    expect(answer.products[0]?.slug).toBe("matkap");
    expect(JSON.stringify(answer)).not.toContain("private-provider-error");
  });
});

describe("Enex HTTP boundaries", () => {
  it("rejects foreign origins before running catalog or OpenAI", async () => {
    const response = await chatPost(request("chat", { messages: [{ role: "user", content: "merhaba" }], context: { pathname: "/" } }, { origin: "https://evil.test" }));
    expect(response.status).toBe(403);
    expect(mocks.catalog).not.toHaveBeenCalled();
  });
  it("rejects invalid and oversized bodies, and marks success as no-store", async () => {
    expect((await chatPost(request("chat", { invalid: true }))).status).toBe(400);
    expect((await chatPost(request("chat", { payload: "x".repeat(50_000) }))).status).toBe(413);
    const response = await contextGet(new Request("https://entas.test/api/enexai/context?pathname=/"));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
  });
  it("returns rate-limit retry hints", async () => {
    mocks.rateLimit.mockResolvedValue({ allowed: false, retryAfterSeconds: 37 });
    const response = await chatPost(request("chat", {}));
    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("37");
  });
  it("enforces deployment-wide cost limits regardless of forged client headers", async () => {
    mocks.rateLimit.mockImplementation(async (scope: string) => ({ allowed: !scope.startsWith("enexai:global:"), retryAfterSeconds: 25 }));
    for (const address of ["192.0.2.1", "192.0.2.2"]) {
      const response = await chatPost(request("chat", {}, { "cf-connecting-ip": address, "x-forwarded-for": address }));
      expect(response.status).toBe(429);
    }
    expect(mocks.rateLimit).toHaveBeenCalledWith("enexai:global:chat", "deployment", { limit: 120, windowMs: 60_000 });
    expect(mocks.catalog).not.toHaveBeenCalled();
  });
  it("returns clear missing-key speech status and rejects long speech", async () => {
    const response = await speechPost(request("speech", { text: "Merhaba" }));
    expect(response.status).toBe(503);
    expect((await response.json()).error).toContain("Yazışarak");
    expect((await speechPost(request("speech", { text: "x".repeat(1801) }))).status).toBe(400);
  });
  it("streams only provider audio with cache disabled", async () => {
    vi.stubEnv("OPENAI_API_KEY", "test-secret-key");
    const fetch = vi.fn().mockResolvedValue(new Response(new Uint8Array([73, 68, 51]), { headers: { "content-type": "audio/mpeg" } }));
    vi.stubGlobal("fetch", fetch);
    const response = await speechPost(request("speech", { text: "Merhaba" }));
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("audio/mpeg");
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(await response.text()).toBe("ID3");
    expect(JSON.parse(fetch.mock.calls[0]![1].body)).toMatchObject({ model: "gpt-4o-mini-tts", input: "Merhaba", voice: "coral" });
  });
});
