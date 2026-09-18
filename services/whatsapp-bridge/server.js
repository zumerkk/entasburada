// ENTASBURADA WhatsApp Web koprusu.
//
// Ana uygulama (WHATSAPP_PROVIDER=bridge) bu servise POST /send atar,
// servis de WhatsApp Web oturumu uzerinden mesaji gonderir.
//
// ONEMLI: Bu yol resmi WhatsApp Business API degildir; WhatsApp Web oturumunu
// otomatiklestirir. Meta'nin kullanim sartlari acisindan risklidir ve numara
// kapatilabilir. Uretimde Cloud API'yi tercih edin, bunu yedek olarak tutun.

import { createServer } from "node:http";
import { mkdirSync } from "node:fs";
import pkg from "whatsapp-web.js";
import qrcode from "qrcode-terminal";

const { Client, LocalAuth } = pkg;

const PORT = Number(process.env.PORT || 8080);
const TOKEN = (process.env.WHATSAPP_BRIDGE_TOKEN || "").trim();
const SESSION_DIR = process.env.SESSION_DIR || "/var/data/wa-session";

mkdirSync(SESSION_DIR, { recursive: true });

let ready = false;
let lastQr = null;
let lastError = null;

const client = new Client({
  authStrategy: new LocalAuth({ dataPath: SESSION_DIR }),
  puppeteer: {
    headless: true,
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--disable-gpu"]
  }
});

client.on("qr", (qr) => {
  lastQr = qr;
  ready = false;
  console.log("[bridge] QR kodu olustu. Telefondan WhatsApp > Bagli cihazlar ile okutun:");
  qrcode.generate(qr, { small: true });
});

client.on("authenticated", () => {
  lastQr = null;
  console.log("[bridge] Oturum dogrulandi.");
});

client.on("ready", () => {
  ready = true;
  lastQr = null;
  lastError = null;
  console.log("[bridge] WhatsApp baglantisi hazir.");
});

client.on("auth_failure", (message) => {
  ready = false;
  lastError = String(message);
  console.error(`[bridge] Kimlik dogrulama hatasi: ${message}`);
});

client.on("disconnected", (reason) => {
  ready = false;
  lastError = String(reason);
  console.warn(`[bridge] Baglanti koptu: ${reason}. Yeniden baglaniliyor...`);
  client.initialize().catch((error) => console.error(`[bridge] Yeniden baglanma hatasi: ${error?.message ?? error}`));
});

const server = createServer(async (request, response) => {
  const url = new URL(request.url ?? "/", `http://localhost:${PORT}`);

  if (request.method === "GET" && url.pathname === "/health") {
    return json(response, 200, { ok: true, ready, waitingForQr: Boolean(lastQr), error: lastError });
  }

  // Loglara erisemeyen ortamlarda QR'i tarayicidan okutabilmek icin.
  if (request.method === "GET" && url.pathname === "/qr") {
    if (!authorized(request)) return json(response, 401, { ok: false, error: "Unauthorized" });
    if (!lastQr) return json(response, 404, { ok: false, error: ready ? "Oturum zaten acik." : "QR henuz uretilmedi." });
    return json(response, 200, { ok: true, qr: lastQr });
  }

  if (request.method === "POST" && url.pathname === "/send") {
    if (!authorized(request)) return json(response, 401, { ok: false, error: "Unauthorized" });
    if (!ready) return json(response, 503, { ok: false, error: "WhatsApp oturumu hazir degil." });

    let payload;
    try {
      payload = JSON.parse(await readBody(request));
    } catch {
      return json(response, 400, { ok: false, error: "Gecersiz JSON." });
    }

    const to = String(payload?.to ?? "").replace(/\D+/g, "");
    const text = String(payload?.text ?? "");
    if (to.length < 8 || !text.trim()) {
      return json(response, 400, { ok: false, error: "to ve text zorunludur." });
    }

    try {
      const chatId = `${to}@c.us`;
      const registered = await client.isRegisteredUser(chatId);
      if (!registered) {
        return json(response, 400, { ok: false, error: `${to} WhatsApp kullanicisi degil.` });
      }
      const sent = await client.sendMessage(chatId, text);
      return json(response, 200, { ok: true, id: sent?.id?._serialized ?? null });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[bridge] Gonderim hatasi (${to}): ${message}`);
      return json(response, 502, { ok: false, error: message });
    }
  }

  return json(response, 404, { ok: false, error: "Not found" });
});

function authorized(request) {
  if (!TOKEN) return true;
  return request.headers.authorization === `Bearer ${TOKEN}`;
}

function json(response, status, body) {
  const payload = JSON.stringify(body);
  response.writeHead(status, { "content-type": "application/json; charset=utf-8", "content-length": Buffer.byteLength(payload) });
  response.end(payload);
}

async function readBody(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 64_000) throw new Error("Govde cok buyuk.");
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}

server.listen(PORT, () => console.log(`[bridge] HTTP ${PORT} portunda dinliyor. Oturum dizini: ${SESSION_DIR}`));

client.initialize().catch((error) => {
  lastError = error instanceof Error ? error.message : String(error);
  console.error(`[bridge] Baslatma hatasi: ${lastError}`);
});
