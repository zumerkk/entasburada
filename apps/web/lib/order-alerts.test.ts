import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({ sendWhatsAppTemplate: vi.fn() }));

vi.mock("./whatsapp", async () => {
  const actual = await vi.importActual<typeof import("./whatsapp")>("./whatsapp");
  return { ...actual, sendWhatsAppTemplate: mocks.sendWhatsAppTemplate };
});

import { buildOrderAlertParams, buildOrderAlertText, orderAlertRecipients, sendNewOrderAlert, type OrderAlertInput } from "./order-alerts";

function firstCallInput(): { template: string; to: string; urlButtonParam?: string } {
  const call = mocks.sendWhatsAppTemplate.mock.calls[0];
  if (!call) throw new Error("sendWhatsAppTemplate cagrilmadi.");
  return call[0];
}

const order: OrderAlertInput = {
  id: "order-9f21",
  orderNo: "SIP-20260917-0004",
  companyName: "ABC İnşaat Ltd. Şti.",
  dealerUser: "Ahmet Yılmaz",
  phone: "+90 532 000 00 00",
  totalAmount: "12500.00",
  currency: "TRY",
  source: "Müşteri teklif onayı",
  deliveryAddress: "Kırıkkale / Yahşihan",
  items: [{ quantity: 3 }, { quantity: 2 }]
};

beforeEach(() => {
  mocks.sendWhatsAppTemplate.mockReset();
  mocks.sendWhatsAppTemplate.mockResolvedValue({ ok: true, provider: "cloud", to: "905413812114" });
  delete process.env.ORDER_ALERT_WHATSAPP;
  delete process.env.WHATSAPP_TEMPLATE_NEW_ORDER;
  delete process.env.NEXT_PUBLIC_SITE_URL;
});

afterEach(() => {
  delete process.env.ORDER_ALERT_WHATSAPP;
  delete process.env.WHATSAPP_TEMPLATE_NEW_ORDER;
  delete process.env.NEXT_PUBLIC_SITE_URL;
});

describe("orderAlertRecipients", () => {
  it("falls back to the two operations numbers", () => {
    expect(orderAlertRecipients()).toEqual(["905413812114", "905401237171"]);
  });

  it("reads and de-duplicates the env override", () => {
    process.env.ORDER_ALERT_WHATSAPP = "+90 555 111 22 33, 0555 111 22 33; 0533 444 55 66";
    expect(orderAlertRecipients()).toEqual(["905551112233", "905334445566"]);
  });

  it("drops entries that are not usable numbers", () => {
    process.env.ORDER_ALERT_WHATSAPP = "0541 381 21 14, dahili-12";
    expect(orderAlertRecipients()).toEqual(["905413812114"]);
  });
});

describe("buildOrderAlertParams", () => {
  it("produces single-line template variables with a Turkish amount", () => {
    const params = buildOrderAlertParams(order);
    expect(params).toEqual([
      "SIP-20260917-0004",
      "ABC İnşaat Ltd. Şti.",
      "12.500,00 TRY",
      "5 adet / 2 kalem",
      "Ahmet Yılmaz · +90 532 000 00 00"
    ]);
    expect(params.some((value) => value.includes("\n"))).toBe(false);
  });
});

describe("buildOrderAlertText", () => {
  it("includes the order number, amount and the admin panel link", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://entasburada.com/";
    const text = buildOrderAlertText(order);
    expect(text).toContain("SIP-20260917-0004");
    expect(text).toContain("12.500,00 TRY");
    expect(text).toContain("https://entasburada.com/admin/orders/order-9f21");
  });
});

describe("sendNewOrderAlert", () => {
  it("sends the template to every recipient with the order id as url button", async () => {
    process.env.ORDER_ALERT_WHATSAPP = "0541 381 21 14, 0540 123 71 71";
    const results = await sendNewOrderAlert(order);

    expect(results).toHaveLength(2);
    expect(mocks.sendWhatsAppTemplate).toHaveBeenCalledTimes(2);
    expect(mocks.sendWhatsAppTemplate.mock.calls.map((call) => call[0].to)).toEqual(["905413812114", "905401237171"]);
    expect(firstCallInput()).toMatchObject({
      template: "yeni_siparis",
      urlButtonParam: "order-9f21"
    });
  });

  it("uses the configured template name", async () => {
    process.env.WHATSAPP_TEMPLATE_NEW_ORDER = "entas_siparis_bildirimi";
    await sendNewOrderAlert(order);
    expect(firstCallInput().template).toBe("entas_siparis_bildirimi");
  });

  it("sends nothing when the recipient list is emptied", async () => {
    process.env.ORDER_ALERT_WHATSAPP = "gecersiz";
    expect(await sendNewOrderAlert(order)).toEqual([]);
    expect(mocks.sendWhatsAppTemplate).not.toHaveBeenCalled();
  });
});
