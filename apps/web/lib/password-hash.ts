import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

export const SCRYPT_PREFIX = "scrypt$";

export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const derived = scryptSync(password, salt, 64);
  return `${SCRYPT_PREFIX}${salt.toString("base64url")}$${derived.toString("base64url")}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  if (!stored) {
    return false;
  }

  if (stored.startsWith(SCRYPT_PREFIX)) {
    const [saltPart, hashPart] = stored.slice(SCRYPT_PREFIX.length).split("$");
    if (!saltPart || !hashPart) {
      return false;
    }
    const expected = Buffer.from(hashPart, "base64url");
    const derived = scryptSync(password, Buffer.from(saltPart, "base64url"), expected.length);
    return derived.length === expected.length && timingSafeEqual(derived, expected);
  }

  // eski duz metin kayit: dogrulama sonrasi cagiran taraf scrypt'e yukseltir
  const provided = Buffer.from(password);
  const legacy = Buffer.from(stored);
  return provided.length === legacy.length && timingSafeEqual(provided, legacy);
}
