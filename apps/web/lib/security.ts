import { createHash, timingSafeEqual } from "node:crypto";

export class RequestSecurityError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
    this.name = "RequestSecurityError";
  }
}

export function constantTimeEqual(left: string, right: string): boolean {
  const leftDigest = createHash("sha256").update(left).digest();
  const rightDigest = createHash("sha256").update(right).digest();
  return timingSafeEqual(leftDigest, rightDigest) && left.length === right.length;
}

export function safeInternalRedirect(value: string, fallback: string): string {
  const candidate = value.trim();
  if (!candidate.startsWith("/") || candidate.startsWith("//") || candidate.startsWith("/\\")) {
    return fallback;
  }

  try {
    const base = new URL("https://internal.invalid");
    const parsed = new URL(candidate, base);
    if (parsed.origin !== base.origin || parsed.username || parsed.password) {
      return fallback;
    }
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return fallback;
  }
}

export function trustedMutationError(request: Request): Response | null {
  if (["GET", "HEAD", "OPTIONS"].includes(request.method.toUpperCase())) {
    return null;
  }

  const fetchSite = request.headers.get("sec-fetch-site")?.toLowerCase();
  if (fetchSite === "cross-site") {
    return Response.json({ error: "Cross-site request rejected" }, { status: 403 });
  }

  const origin = request.headers.get("origin");
  if (!origin) {
    return Response.json({ error: "Request origin required" }, { status: 403 });
  }

  const allowedOrigins = new Set<string>();
  try {
    allowedOrigins.add(new URL(request.url).origin);
  } catch {
    return Response.json({ error: "Invalid request URL" }, { status: 400 });
  }

  const configuredSite = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (configuredSite) {
    try {
      allowedOrigins.add(new URL(configuredSite).origin);
    } catch {
      if (process.env.NODE_ENV === "production") {
        return Response.json({ error: "Server origin is misconfigured" }, { status: 500 });
      }
    }
  }

  try {
    if (!allowedOrigins.has(new URL(origin).origin)) {
      return Response.json({ error: "Request origin rejected" }, { status: 403 });
    }
  } catch {
    return Response.json({ error: "Invalid request origin" }, { status: 403 });
  }

  return null;
}

export async function readJsonBody<T>(request: Request, maxBytes = 64 * 1024): Promise<T> {
  const text = await readBodyText(request, maxBytes);
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new RequestSecurityError("Geçersiz JSON isteği.", 400);
  }
}

export async function readBodyText(request: Request, maxBytes: number): Promise<string> {
  const declaredLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    throw new RequestSecurityError("İstek gövdesi izin verilen sınırı aşıyor.", 413);
  }

  if (!request.body) {
    return "";
  }

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => undefined);
      throw new RequestSecurityError("İstek gövdesi izin verilen sınırı aşıyor.", 413);
    }
    chunks.push(value);
  }

  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }

  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(body);
  } catch {
    throw new RequestSecurityError("İstek geçerli UTF-8 metni değil.", 400);
  }
}

export function requestErrorResponse(error: unknown, fallback: string): Response {
  if (error instanceof RequestSecurityError) {
    return Response.json({ error: error.message }, { status: error.status });
  }
  return Response.json({ error: error instanceof Error ? error.message : fallback }, { status: 400 });
}

export function getClientAddress(headers: Pick<Headers, "get">): string {
  return (
    headers.get("cf-connecting-ip")?.trim() ||
    headers.get("x-real-ip")?.trim() ||
    headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "unknown"
  ).slice(0, 128);
}

export function validatePasswordStrength(password: string): string | null {
  if (password.length < 12) return "Şifre en az 12 karakter olmalı.";
  if (password.length > 128) return "Şifre en fazla 128 karakter olabilir.";
  if (/\s/.test(password)) return "Şifre boşluk içeremez.";
  if (!/[a-zçğıöşü]/.test(password) || !/[A-ZÇĞİÖŞÜ]/.test(password) || !/\d/.test(password) || !/[^\p{L}\p{N}]/u.test(password)) {
    return "Şifre küçük harf, büyük harf, rakam ve özel karakter içermeli.";
  }
  return null;
}

export function noStoreJson(body: unknown, status = 200): Response {
  return Response.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store, max-age=0",
      Pragma: "no-cache"
    }
  });
}

export function assertProductionSecurityConfiguration(): void {
  if (process.env.NODE_ENV !== "production") return;
  const authSecret = process.env.AUTH_SECRET?.trim() ?? "";
  const adminSecret = process.env.ADMIN_SESSION_SECRET?.trim() ?? "";
  if (authSecret.length < 32 || adminSecret.length < 32 || constantTimeEqual(authSecret, adminSecret)) {
    throw new Error("Production oturum anahtarları eksik, kısa veya birbirinin aynısı.");
  }
  const adminEmail = process.env.ADMIN_EMAIL?.trim() ?? "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(adminEmail)) throw new Error("ADMIN_EMAIL geçersiz.");
  const password = process.env.ADMIN_PASSWORD ?? "";
  const passwordHash = process.env.ADMIN_PASSWORD_HASH?.trim() ?? "";
  if (!passwordHash && password.length < 16) throw new Error("Production admin parolası güvenlik politikasını karşılamıyor.");
  if (passwordHash && !passwordHash.startsWith("scrypt$")) throw new Error("ADMIN_PASSWORD_HASH biçimi geçersiz.");
  const totpSecret = process.env.ADMIN_TOTP_SECRET?.trim() ?? "";
  if (totpSecret.replace(/[\s=-]/g, "").length < 32 || /[^A-Z2-7\s=-]/i.test(totpSecret)) {
    throw new Error("ADMIN_TOTP_SECRET production ortamında en az 160 bit geçerli base32 anahtar olmalıdır.");
  }
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim() ?? "";
  try {
    if (new URL(siteUrl).protocol !== "https:") throw new Error("HTTPS zorunlu.");
  } catch {
    throw new Error("NEXT_PUBLIC_SITE_URL production ortamında geçerli bir HTTPS adresi olmalıdır.");
  }
}
