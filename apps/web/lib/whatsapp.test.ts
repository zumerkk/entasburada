import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  normalizeWhatsAppNumber,
  resolveWhatsAppProvider,
  sanitizeTemplateParam,
  sendWhatsAppTemplate,
  sendWhatsAppText
} from "./whatsapp";

const WHATSAPP_ENV_KEYS = [
  "WHATSAPP_PROVIDER",
  "WHATSAPP_PHONE_NUMBER_ID",
  "WHATSAPP_TOKEN",
  "WHATSAPP_API_VERSION",
  "WHATSAPP_TEMPLATE_LANG",
  "WHATSAPP_BRIDGE_URL",
  "WHATSAPP_BRIDGE_TOKEN"
] as const;

function clearWhatsAppEnv(): void {
  for (const key of WHATSAPP_ENV_KEYS) {
    delete process.env[key];
  }
}

beforeEach(() => {
  clearWhatsAppEnv();
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
});

afterEach(() => {
  clearWhatsAppEnv();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function stubFetch(response: { ok?: boolean; status?: number; body?: unknown }) {
  const fetchMock = vi.fn(async () => ({
    ok: response.ok ?? true,
    status: response.status ?? 200,
    json: async () => response.body ?? {},
    text: async () => JSON.stringify(response.body ?? {})
  }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("normalizeWhatsAppNumber", () => {
  it("normalises the Turkish formats the panel stores", () => {
    expect(normalizeWhatsAppNumber("+90 541 381 21 14")).toBe("905413812114");
    expect(normalizeWhatsAppNumber("0541 381 21 14")).toBe("905413812114");
    expect(normalizeWhatsAppNumber("541 381 21 14")).toBe("905413812114");
    expect(normalizeWhatsAppNumber("905403812114")).toBe("905403812114");
    expect(normalizeWhatsAppNumber("0090 540 123 71 71")).toBe("905401237171");
  });

  it("rejects values that cannot be an E.164 number", () => {
    expect(normalizeWhatsAppNumber("")).toBeNull();
    expect(normalizeWhatsAppNumber("dahili 12")).toBeNull();
    expect(normalizeWhatsAppNumber("9054012371719999999")).toBeNull();
  });
});

describe("resolveWhatsAppProvider", () => {
  it("is off when nothing is configured", () => {
    expect(resolveWhatsAppProvider()).toBe("off");
  });

  it("auto-selects cloud when Cloud API credentials exist", () => {
    process.env.WHATSAPP_PHONE_NUMBER_ID = "123";
    process.env.WHATSAPP_TOKEN = "token";
    expect(resolveWhatsAppProvider()).toBe("cloud");
  });

  it("auto-selects the bridge when only the bridge url exists", () => {
    process.env.WHATSAPP_BRIDGE_URL = "http://bridge:8080";
    expect(resolveWhatsAppProvider()).toBe("bridge");
  });

  it("honours an explicit override", () => {
    process.env.WHATSAPP_PHONE_NUMBER_ID = "123";
    process.env.WHATSAPP_TOKEN = "token";
    process.env.WHATSAPP_PROVIDER = "off";
    expect(resolveWhatsAppProvider()).toBe("off");
  });
});

describe("sendWhatsAppTemplate", () => {
  it("posts a Cloud API template with body params and the url button", async () => {
    process.env.WHATSAPP_PHONE_NUMBER_ID = "555000";
    process.env.WHATSAPP_TOKEN = "secret-token";
    const fetchMock = stubFetch({ body: { messages: [{ id: "wamid.123" }] } });

    const result = await sendWhatsAppTemplate({
      to: "0541 381 21 14",
      template: "yeni_siparis",
      params: ["SIP-1", "ABC Ltd."],
      urlButtonParam: "order-9",
      fallbackText: "duz metin"
    });

    expect(result).toEqual({ ok: true, provider: "cloud", to: "905413812114", messageId: "wamid.123" });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://graph.facebook.com/v23.0/555000/messages");
    expect((init.headers as Record<string, string>).authorization).toBe("Bearer secret-token");

    const payload = JSON.parse(String(init.body));
    expect(payload.to).toBe("905413812114");
    expect(payload.template.name).toBe("yeni_siparis");
    expect(payload.template.language.code).toBe("tr");
    expect(payload.template.components[0]).toEqual({
      type: "body",
      parameters: [
        { type: "text", text: "SIP-1" },
        { type: "text", text: "ABC Ltd." }
      ]
    });
    expect(payload.template.components[1]).toEqual({
      type: "button",
      sub_type: "url",
      index: "0",
      parameters: [{ type: "text", text: "order-9" }]
    });
  });

  it("sends the plain fallback text through the bridge, since it has no templates", async () => {
    process.env.WHATSAPP_BRIDGE_URL = "http://bridge:8080/";
    process.env.WHATSAPP_BRIDGE_TOKEN = "bridge-secret";
    const fetchMock = stubFetch({ body: { ok: true, id: "true_905413812114" } });

    const result = await sendWhatsAppTemplate({
      to: "+90 541 381 21 14",
      template: "yeni_siparis",
      params: ["SIP-1"],
      fallbackText: "🛒 YENİ SİPARİŞ — SIP-1"
    });

    expect(result).toEqual({ ok: true, provider: "bridge", to: "905413812114", messageId: "true_905413812114" });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("http://bridge:8080/send");
    expect((init.headers as Record<string, string>).authorization).toBe("Bearer bridge-secret");
    expect(JSON.parse(String(init.body))).toEqual({ to: "905413812114", text: "🛒 YENİ SİPARİŞ — SIP-1" });
  });

  it("reports the Cloud API error message instead of throwing", async () => {
    process.env.WHATSAPP_PHONE_NUMBER_ID = "555000";
    process.env.WHATSAPP_TOKEN = "secret-token";
    stubFetch({ ok: false, status: 400, body: { error: { message: "Template name does not exist" } } });

    const result = await sendWhatsAppTemplate({
      to: "905413812114",
      template: "yok",
      params: [],
      fallbackText: "x"
    });

    expect(result.ok).toBe(false);
    expect(result.error).toBe("Template name does not exist");
  });

  it("does not call out when no provider is configured", async () => {
    const fetchMock = stubFetch({});
    const result = await sendWhatsAppTemplate({ to: "905413812114", template: "t", params: [], fallbackText: "x" });

    expect(result.ok).toBe(false);
    expect(result.provider).toBe("off");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("sendWhatsAppText", () => {
  it("posts a Cloud API text message", async () => {
    process.env.WHATSAPP_PHONE_NUMBER_ID = "555000";
    process.env.WHATSAPP_TOKEN = "secret-token";
    const fetchMock = stubFetch({ body: { messages: [{ id: "wamid.9" }] } });

    const result = await sendWhatsAppText({ to: "0540 123 71 71", text: "test" });

    expect(result.ok).toBe(true);
    const payload = JSON.parse(String((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body));
    expect(payload).toMatchObject({ type: "text", to: "905401237171", text: { body: "test" } });
  });

  it("rejects an unusable number before any request", async () => {
    process.env.WHATSAPP_PHONE_NUMBER_ID = "555000";
    process.env.WHATSAPP_TOKEN = "secret-token";
    const fetchMock = stubFetch({});

    const result = await sendWhatsAppText({ to: "yok", text: "test" });

    expect(result.ok).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("sanitizeTemplateParam", () => {
  it("flattens the characters Meta rejects in template variables", () => {
    expect(sanitizeTemplateParam("ABC\nLtd.\tŞti.")).toBe("ABC Ltd. Şti.");
    expect(sanitizeTemplateParam("  bosluk      testi ")).toBe("bosluk   testi");
  });
});
