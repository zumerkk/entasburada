import "server-only";

// WhatsApp gonderimi iki saglayici ile calisir:
// 1) "cloud"  — Meta WhatsApp Cloud API (resmi). Isletme tarafindan baslatilan
//    mesajlar icin Meta'da onayli sablon (template) zorunludur.
// 2) "bridge" — kendi sunucumuzda calisan WhatsApp Web koprusu (QR ile baglanan
//    servis). Sablon kavrami yoktur, duz metin gonderir.
// Hicbiri tanimli degilse sessizce atlanir (ok:false doner) — siparis akisini kirmaz.

export type WhatsAppProvider = "cloud" | "bridge" | "off";

export interface WhatsAppTextInput {
  to: string;
  text: string;
}

export interface WhatsAppTemplateInput {
  to: string;
  /** Meta'da onaylanmis sablon adi. */
  template: string;
  language?: string;
  /** Sablon govdesindeki {{1}}, {{2}}... degerleri. Satir sonu icermemelidir. */
  params: string[];
  /** Dinamik URL butonu varsa sonuna eklenecek parca (or. siparis id). */
  urlButtonParam?: string;
  /** Bridge saglayicisinda sablon yoktur; bunun yerine bu metin gonderilir. */
  fallbackText: string;
}

export interface WhatsAppSendResult {
  ok: boolean;
  provider: WhatsAppProvider;
  to: string;
  messageId?: string;
  error?: string;
}

const SEND_TIMEOUT_MS = 15_000;

export function resolveWhatsAppProvider(): WhatsAppProvider {
  const explicit = process.env.WHATSAPP_PROVIDER?.trim().toLowerCase();
  if (explicit === "cloud" || explicit === "bridge" || explicit === "off") {
    return explicit;
  }
  if (isCloudConfigured()) return "cloud";
  if (isBridgeConfigured()) return "bridge";
  return "off";
}

export function isWhatsAppConfigured(): boolean {
  const provider = resolveWhatsAppProvider();
  if (provider === "cloud") return isCloudConfigured();
  if (provider === "bridge") return isBridgeConfigured();
  return false;
}

/**
 * Turkiye numaralarini WhatsApp'in bekledigi E.164 rakam dizisine cevirir.
 * "0541 381 21 14", "+90 541 381 21 14", "905413812114" -> "905413812114".
 * Cozulemeyen deger icin null doner.
 */
export function normalizeWhatsAppNumber(raw: string): string | null {
  let digits = raw.replace(/\D+/g, "");
  if (!digits) return null;

  if (digits.startsWith("00")) {
    digits = digits.replace(/^0+/, "");
  }
  if (digits.startsWith("0")) {
    digits = `90${digits.slice(1)}`;
  } else if (digits.length === 10 && digits.startsWith("5")) {
    digits = `90${digits}`;
  }

  // E.164: ulke kodu dahil 8-15 hane.
  if (digits.length < 8 || digits.length > 15) return null;
  return digits;
}

export async function sendWhatsAppText(input: WhatsAppTextInput): Promise<WhatsAppSendResult> {
  const provider = resolveWhatsAppProvider();
  const to = normalizeWhatsAppNumber(input.to);
  if (!to) {
    return { ok: false, provider, to: input.to, error: "Gecersiz telefon numarasi." };
  }
  if (provider === "off") {
    return { ok: false, provider, to, error: "WhatsApp saglayicisi tanimli degil." };
  }
  if (provider === "bridge") {
    return sendViaBridge(to, input.text);
  }
  return sendViaCloud(to, {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to,
    type: "text",
    text: { preview_url: false, body: input.text }
  });
}

export async function sendWhatsAppTemplate(input: WhatsAppTemplateInput): Promise<WhatsAppSendResult> {
  const provider = resolveWhatsAppProvider();
  const to = normalizeWhatsAppNumber(input.to);
  if (!to) {
    return { ok: false, provider, to: input.to, error: "Gecersiz telefon numarasi." };
  }
  if (provider === "off") {
    return { ok: false, provider, to, error: "WhatsApp saglayicisi tanimli degil." };
  }
  // WhatsApp Web koprusunde sablon yoktur; hazir metni gondeririz.
  if (provider === "bridge") {
    return sendViaBridge(to, input.fallbackText);
  }

  const components: unknown[] = [
    {
      type: "body",
      parameters: input.params.map((value) => ({ type: "text", text: sanitizeTemplateParam(value) }))
    }
  ];
  if (input.urlButtonParam) {
    components.push({
      type: "button",
      sub_type: "url",
      index: "0",
      parameters: [{ type: "text", text: sanitizeTemplateParam(input.urlButtonParam) }]
    });
  }

  return sendViaCloud(to, {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to,
    type: "template",
    template: {
      name: input.template,
      language: { code: input.language?.trim() || defaultTemplateLanguage() },
      components
    }
  });
}

/**
 * Sablon degiskenleri satir sonu, sekme veya 4'ten fazla ard arda bosluk
 * icerirse Meta mesaji reddeder; bu yuzden tek satira indirgiyoruz.
 */
export function sanitizeTemplateParam(value: string): string {
  return value.replace(/[\r\n\t]+/g, " ").replace(/ {4,}/g, "   ").trim();
}

export function isCloudConfigured(): boolean {
  return Boolean(process.env.WHATSAPP_PHONE_NUMBER_ID?.trim() && process.env.WHATSAPP_TOKEN?.trim());
}

export function isBridgeConfigured(): boolean {
  return Boolean(process.env.WHATSAPP_BRIDGE_URL?.trim());
}

export function defaultTemplateLanguage(): string {
  return process.env.WHATSAPP_TEMPLATE_LANG?.trim() || "tr";
}

async function sendViaCloud(to: string, payload: Record<string, unknown>): Promise<WhatsAppSendResult> {
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID?.trim();
  const token = process.env.WHATSAPP_TOKEN?.trim();
  if (!phoneNumberId || !token) {
    return { ok: false, provider: "cloud", to, error: "WHATSAPP_PHONE_NUMBER_ID / WHATSAPP_TOKEN tanimli degil." };
  }

  const version = process.env.WHATSAPP_API_VERSION?.trim() || "v23.0";
  try {
    const response = await fetch(`https://graph.facebook.com/${version}/${phoneNumberId}/messages`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json"
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(SEND_TIMEOUT_MS)
    });

    const body = (await response.json().catch(() => null)) as CloudApiResponse | null;
    if (!response.ok) {
      const reason = body?.error?.message ?? `HTTP ${response.status}`;
      console.warn(`[whatsapp] Cloud API gonderim basarisiz (${to}): ${reason}`);
      return { ok: false, provider: "cloud", to, error: reason };
    }

    const messageId = body?.messages?.[0]?.id;
    return messageId ? { ok: true, provider: "cloud", to, messageId } : { ok: true, provider: "cloud", to };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    console.warn(`[whatsapp] Cloud API gonderim hatasi (${to}): ${reason}`);
    return { ok: false, provider: "cloud", to, error: reason };
  }
}

async function sendViaBridge(to: string, text: string): Promise<WhatsAppSendResult> {
  const base = process.env.WHATSAPP_BRIDGE_URL?.trim();
  if (!base) {
    return { ok: false, provider: "bridge", to, error: "WHATSAPP_BRIDGE_URL tanimli degil." };
  }

  const token = process.env.WHATSAPP_BRIDGE_TOKEN?.trim();
  try {
    const response = await fetch(`${base.replace(/\/+$/, "")}/send`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(token ? { authorization: `Bearer ${token}` } : {})
      },
      body: JSON.stringify({ to, text }),
      signal: AbortSignal.timeout(SEND_TIMEOUT_MS)
    });

    const body = (await response.json().catch(() => null)) as BridgeResponse | null;
    if (!response.ok || body?.ok === false) {
      const reason = body?.error ?? `HTTP ${response.status}`;
      console.warn(`[whatsapp] Kopru gonderim basarisiz (${to}): ${reason}`);
      return { ok: false, provider: "bridge", to, error: reason };
    }

    return body?.id ? { ok: true, provider: "bridge", to, messageId: body.id } : { ok: true, provider: "bridge", to };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    console.warn(`[whatsapp] Kopru gonderim hatasi (${to}): ${reason}`);
    return { ok: false, provider: "bridge", to, error: reason };
  }
}

interface CloudApiResponse {
  messages?: Array<{ id?: string }>;
  error?: { message?: string };
}

interface BridgeResponse {
  ok?: boolean;
  id?: string;
  error?: string;
}
