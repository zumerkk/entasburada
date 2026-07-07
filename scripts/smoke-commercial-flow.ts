import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

interface JsonResponse<T> {
  body: T;
  status: number;
}

interface CreateQuoteResponse {
  quoteNo: string;
  trackingCode: string;
  status: string;
  detailUrl: string;
}

interface AdminQuoteList {
  total: number;
  items: Array<{
    id: string;
    quoteNo: string;
    trackingCode: string;
    status: string;
    totalAmount: string;
    items: Array<{ id: string; sku: string; quantity: number }>;
  }>;
}

interface AdminOrderList {
  total: number;
  items: Array<{
    id: string;
    orderNo: string;
    trackingCode: string;
    status: string;
    totalAmount: string;
  }>;
}

interface CartResponse {
  cart: {
    items: Array<{ sku: string; quantity: number; unitNetPrice: string; lineTotal: string; discountRate?: string; priceRuleLabel?: string }>;
    totalAmount: string;
  };
}

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const baseUrl = process.env.ENTAS_BASE_URL ?? "http://localhost:3000";
const adminCookie = "entas_admin_session=dev-admin-session";
const customerCookie = "entas_customer_session=cust-test-project";
const mutableFiles = ["data/quotes.json", "data/orders.json", "data/carts.json", "data/notifications.json"];

async function main(): Promise<void> {
  const backups = await backupMutableFiles();
  const runId = Date.now();
  const report: Record<string, unknown> = {};

  try {
    const sku = await firstPricedSku();

    const health = await requestJson<{ ok: boolean; catalog: { importedRows: number } }>("/api/health");
    assert(health.body.ok === true, "Health endpoint ok olmali.");
    assert(health.body.catalog.importedRows > 0, "Katalogda import edilmis urun olmali.");
    report.health = { importedRows: health.body.catalog.importedRows };

    const unauthorizedAdmin = await requestJson<{ error: string }>("/api/admin/quotes?limit=1", { expectedStatus: 401 });
    assert(unauthorizedAdmin.body.error === "Unauthorized", "Admin API cookie olmadan 401 donmeli.");

    const createdQuote = await requestJson<CreateQuoteResponse>("/api/quotes", {
      method: "POST",
      expectedStatus: 201,
      body: {
        companyTitle: `Smoke Test ${runId}`,
        authorizedPerson: "Smoke Kullanici",
        phone: "05550001122",
        email: `smoke-${runId}@entasburada.com`,
        projectName: "Otomatik smoke test",
        projectCode: `SMOKE-${runId}`,
        deliveryCity: "Istanbul",
        deliveryAddress: "Smoke test teslimat adresi",
        paymentPreference: "Cari hesap",
        notes: "Otomatik smoke test kaydidir; script sonunda geri alinir.",
        items: [
          { sku, quantity: 2, unit: "Adet", targetPrice: "500" },
          { sku, quantity: 1, unit: "Adet", targetPrice: "450" }
        ]
      }
    });
    assert(createdQuote.body.status === "SUBMITTED", "Public teklif SUBMITTED olmali.");

    const quoteList = await requestJson<AdminQuoteList>(`/api/admin/quotes?q=${encodeURIComponent(createdQuote.body.trackingCode)}&limit=5`, {
      headers: { Cookie: adminCookie }
    });
    const quote = quoteList.body.items.find((item) => item.trackingCode === createdQuote.body.trackingCode);
    assert(Boolean(quote), "Admin teklif listesi yeni teklifi gormeli.");
    assert((quote?.items.length ?? 0) >= 1, "Teklif satirlari admin API'de gorunmeli.");

    const pricedQuote = await requestJson<{ quote: AdminQuoteList["items"][number] }>("/api/admin/quotes", {
      method: "POST",
      headers: { Cookie: adminCookie },
      body: {
        action: "price",
        quoteId: quote!.id,
        salesRepresentative: "Smoke Admin",
        internalNote: "Otomatik smoke test fiyatlandirmasi.",
        prices: quote!.items.map((item, index) => ({
          itemId: item.id,
          quotedUnitPrice: index === 0 ? "510.25" : "360.50"
        }))
      }
    });
    assert(pricedQuote.body.quote.status === "PRICED", "Admin fiyatlandirma PRICED durumuna getirmeli.");
    assert(Number(pricedQuote.body.quote.totalAmount) > 0, "Fiyatlanan teklif toplam tutar uretmeli.");

    const converted = await requestJson<{ order: AdminOrderList["items"][number] }>("/api/admin/quotes", {
      method: "POST",
      expectedStatus: 201,
      headers: { Cookie: adminCookie },
      body: { action: "convert", quoteId: quote!.id }
    });
    assert(converted.body.order.status === "FINANCE_APPROVAL_PENDING", "Tekliften siparis finans onayi beklemeli.");

    const updatedOrder = await requestJson<{ order: AdminOrderList["items"][number] & { financeApproval: string; stockStatus: string; shipmentStatus: string } }>(
      "/api/admin/orders",
      {
        method: "POST",
        headers: { Cookie: adminCookie },
        body: {
          orderId: converted.body.order.id,
          status: "READY_TO_SHIP",
          paymentStatus: "Cari hesap onaylandi",
          financeApproval: "Onaylandi",
          stockStatus: "Stok ayrildi",
          shipmentStatus: "Sevkiyat planlandi",
          warehouse: "Ana Depo",
          internalNote: "Otomatik smoke test operasyon guncellemesi."
        }
      }
    );
    assert(updatedOrder.body.order.status === "READY_TO_SHIP", "Admin siparis operasyon guncellemesi calismali.");

    const trackedOrder = await requestJson<{ status: string; trackingCode: string }>(`/api/orders?code=${converted.body.order.trackingCode}`);
    assert(trackedOrder.body.status === "READY_TO_SHIP", "Public siparis takip durumu guncel olmali.");

    const unauthorizedCart = await requestJson<{ error: string }>("/api/cart", { expectedStatus: 401 });
    assert(unauthorizedCart.body.error === "Customer login required", "Sepet API girissiz 401 donmeli.");

    await requestJson<CartResponse>("/api/cart", {
      method: "POST",
      headers: { Cookie: customerCookie },
      body: { clear: true }
    });
    const cart = await requestJson<CartResponse>("/api/cart", {
      method: "POST",
      expectedStatus: 201,
      headers: { Cookie: customerCookie },
      body: { items: [{ sku, quantity: 2, unit: "Adet" }] }
    });
    assert(cart.body.cart.items.length === 1, "Bayi sepetine urun eklenmeli.");
    assert(Number(cart.body.cart.totalAmount) > 0, "Bayi sepeti fiyat motoruyla toplam uretmeli.");

    const checkoutOrder = await requestJson<{ orderNo: string; trackingCode: string; status: string }>("/api/cart/checkout", {
      method: "POST",
      expectedStatus: 201,
      headers: { Cookie: customerCookie },
      body: { mode: "order" }
    });
    assert(checkoutOrder.body.status === "FINANCE_APPROVAL_PENDING", "Sepetten direkt siparis olusmali.");

    const emptiedCart = await requestJson<CartResponse>("/api/cart", { headers: { Cookie: customerCookie } });
    assert(emptiedCart.body.cart.items.length === 0, "Checkout sonrasi sepet temizlenmeli.");

    for (const route of ["/admin/quotes", "/admin/orders", "/admin/integrations", "/account", `/orders/${checkoutOrder.body.trackingCode}`]) {
      const page = await fetch(`${baseUrl}${route}`, { headers: { Cookie: `${adminCookie}; ${customerCookie}` } });
      assert(page.status === 200, `${route} sayfasi 200 donmeli; gelen ${page.status}.`);
    }

    report.quote = {
      quoteNo: createdQuote.body.quoteNo,
      trackingCode: createdQuote.body.trackingCode,
      pricedTotal: pricedQuote.body.quote.totalAmount
    };
    report.order = {
      orderNo: converted.body.order.orderNo,
      trackingCode: converted.body.order.trackingCode,
      finalStatus: updatedOrder.body.order.status
    };
    report.cartCheckout = checkoutOrder.body;
    report.ok = true;
    console.log(JSON.stringify(report, null, 2));
  } finally {
    await restoreMutableFiles(backups);
  }
}

async function requestJson<T>(
  route: string,
  options: {
    body?: unknown;
    expectedStatus?: number;
    headers?: Record<string, string>;
    method?: "GET" | "POST";
  } = {}
): Promise<JsonResponse<T>> {
  const response = await fetch(`${baseUrl}${route}`, {
    method: options.method ?? (options.body ? "POST" : "GET"),
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...options.headers
    },
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  const text = await response.text();
  const body = text ? (JSON.parse(text) as T) : ({} as T);
  const expected = options.expectedStatus ?? 200;
  assert(response.status === expected, `${route} ${expected} donmeli; gelen ${response.status}: ${text}`);
  return { body, status: response.status };
}

async function firstPricedSku(): Promise<string> {
  const store = await readJson<{ products: Array<{ sku: string; listPrice?: string; status: string; isVisible: boolean }> }>("data/catalog-store.json", {
    products: []
  });
  const product = store.products.find((item) => item.status === "ACTIVE" && item.isVisible && item.sku && Number(item.listPrice ?? "0") > 0);
  assert(Boolean(product), "Smoke test icin fiyatli aktif SKU bulunmali.");
  return product!.sku;
}

async function backupMutableFiles(): Promise<Map<string, string>> {
  const backups = new Map<string, string>();
  for (const file of mutableFiles) {
    backups.set(file, await readText(file, "[]\n"));
  }
  return backups;
}

async function restoreMutableFiles(backups: Map<string, string>): Promise<void> {
  for (const [file, content] of backups) {
    await writeFile(path.join(rootDir, file), content);
  }
}

async function readJson<T>(relativePath: string, fallback: T): Promise<T> {
  return JSON.parse(await readText(relativePath, JSON.stringify(fallback))) as T;
}

async function readText(relativePath: string, fallback: string): Promise<string> {
  try {
    return await readFile(path.join(rootDir, relativePath), "utf8");
  } catch (error) {
    const code = typeof error === "object" && error !== null && "code" in error ? String(error.code) : "";
    if (code === "ENOENT") {
      return fallback;
    }
    throw error;
  }
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
