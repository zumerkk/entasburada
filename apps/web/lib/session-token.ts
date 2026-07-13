import { createHmac, timingSafeEqual } from "node:crypto";

export function createSessionToken(subject: string, secret: string, maxAgeSeconds: number): string {
  const expiresAt = Math.floor(Date.now() / 1000) + maxAgeSeconds;
  const payload = `${Buffer.from(subject).toString("base64url")}.${expiresAt}`;
  return `v1.${payload}.${sign(payload, secret)}`;
}

export function verifySessionToken(token: string, secret: string): string | null {
  if (!token) {
    return null;
  }

  const parts = token.split(".");
  if (parts.length !== 4 || parts[0] !== "v1") {
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
  if (!Number.isFinite(expiresAt) || expiresAt * 1000 < Date.now()) {
    return null;
  }

  return Buffer.from(subjectPart, "base64url").toString("utf8");
}

function sign(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}
