import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

interface SessionPayload {
  subject: string;
  nonce: string;
}

export function createSessionToken(subject: string, secret: string, maxAgeSeconds: number): string {
  if (!subject || subject.length > 1_024 || !Number.isInteger(maxAgeSeconds) || maxAgeSeconds <= 0) {
    throw new Error("Geçersiz oturum belirteci parametreleri.");
  }
  const expiresAt = Math.floor(Date.now() / 1000) + maxAgeSeconds;
  const sessionPayload: SessionPayload = { subject, nonce: randomBytes(16).toString("base64url") };
  const subjectPart = Buffer.from(JSON.stringify(sessionPayload)).toString("base64url");
  const payload = `${subjectPart}.${expiresAt}`;
  return `v2.${payload}.${sign(payload, secret)}`;
}

export function verifySessionToken(token: string, secret: string): string | null {
  if (!token) {
    return null;
  }

  const parts = token.split(".");
  if (parts.length !== 4 || parts[0] !== "v2") {
    return null;
  }

  const [, subjectPart, expPart, signature] = parts as [string, string, string, string];
  const payload = `${subjectPart}.${expPart}`;
  const expected = Buffer.from(sign(payload, secret));
  const provided = Buffer.from(signature);
  if (expected.length !== provided.length || !timingSafeEqual(expected, provided)) {
    return null;
  }

  const expiresAt = Number(expPart);
  if (!Number.isSafeInteger(expiresAt) || expiresAt * 1000 <= Date.now()) {
    return null;
  }

  try {
    const decoded = Buffer.from(subjectPart, "base64url").toString("utf8");
    if (!decoded || decoded.length > 1_200 || Buffer.from(decoded).toString("base64url") !== subjectPart) {
      return null;
    }
    const parsed = JSON.parse(decoded) as Partial<SessionPayload>;
    if (
      typeof parsed.subject !== "string" || !parsed.subject || parsed.subject.length > 1_024 ||
      typeof parsed.nonce !== "string" || !/^[A-Za-z0-9_-]{22}$/.test(parsed.nonce)
    ) {
      return null;
    }
    return parsed.subject;
  } catch {
    return null;
  }
}

function sign(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}
