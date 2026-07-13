import "server-only";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { isPublicNetworkAddress } from "./network-safety";

const DEFAULT_PRODUCTION_HOSTS = ["bayi.euro-mix.com.tr"];
const MAX_XML_BYTES = 20 * 1024 * 1024;
const MAX_REDIRECTS = 3;

export async function fetchRemoteXml(urlValue: string): Promise<string> {
  let url = new URL(urlValue);

  for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount += 1) {
    await assertSafeRemoteUrl(url);
    const response = await fetch(url, {
      cache: "no-store",
      redirect: "manual",
      signal: AbortSignal.timeout(15_000),
      headers: { Accept: "application/xml,text/xml,text/plain;q=0.9,*/*;q=0.1" }
    });

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location || redirectCount === MAX_REDIRECTS) {
        throw new Error("XML URL cok fazla veya gecersiz yonlendirme dondurdu.");
      }
      url = new URL(location, url);
      continue;
    }

    if (!response.ok) {
      throw new Error(`XML URL okunamadi: ${response.status}`);
    }

    const declaredLength = Number(response.headers.get("content-length") ?? "0");
    if (declaredLength > MAX_XML_BYTES) {
      throw new Error("XML dosyasi 20 MB sinirini asiyor.");
    }

    const buffer = await response.arrayBuffer();
    if (buffer.byteLength > MAX_XML_BYTES) {
      throw new Error("XML dosyasi 20 MB sinirini asiyor.");
    }

    return new TextDecoder("utf-8").decode(buffer);
  }

  throw new Error("XML URL okunamadi.");
}

async function assertSafeRemoteUrl(url: URL): Promise<void> {
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error("Yalnizca http/https XML URL desteklenir.");
  }
  if (url.username || url.password) {
    throw new Error("Kimlik bilgisi iceren XML URL desteklenmez.");
  }

  const hostname = url.hostname.toLowerCase().replace(/\.$/, "");
  if (!hostname || hostname === "localhost" || hostname.endsWith(".localhost") || hostname.endsWith(".local") || hostname.endsWith(".internal")) {
    throw new Error("Yerel veya ozel ag XML adresleri desteklenmez.");
  }

  if (process.env.NODE_ENV === "production" && !isAllowedProductionHost(hostname)) {
    throw new Error("XML kaynak hostu production izin listesinde degil.");
  }

  const addresses = isIP(hostname) ? [hostname] : (await lookup(hostname, { all: true, verbatim: true })).map((entry) => entry.address);
  if (addresses.length === 0 || addresses.some((address) => !isPublicNetworkAddress(address))) {
    throw new Error("Yerel veya ozel ag XML adresleri desteklenmez.");
  }
}

function isAllowedProductionHost(hostname: string): boolean {
  const configuredHosts = (process.env.XML_IMPORT_ALLOWED_HOSTS ?? "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  const allowedHosts = [...DEFAULT_PRODUCTION_HOSTS, ...configuredHosts];
  return allowedHosts.some((allowedHost) => hostname === allowedHost || hostname.endsWith(`.${allowedHost}`));
}
