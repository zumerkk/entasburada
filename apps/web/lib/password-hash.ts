import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

export const SCRYPT_PREFIX = "scrypt$";
const SALT_BYTES = 16;
const HASH_BYTES = 64;

export function hashPassword(password: string): string {
  if (!password || password.length > 128) {
    throw new Error("Şifre uzunluğu geçersiz.");
  }
  const salt = randomBytes(SALT_BYTES);
  const derived = scryptSync(password, salt, HASH_BYTES);
  return `${SCRYPT_PREFIX}${salt.toString("base64url")}$${derived.toString("base64url")}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  if (!stored) {
    return false;
  }

  if (!stored.startsWith(SCRYPT_PREFIX)) {
    return false;
  }

  const [saltPart, hashPart] = stored.slice(SCRYPT_PREFIX.length).split("$");
  if (!saltPart || !hashPart) {
    return false;
  }
  if (password.length > 128 || !/^[A-Za-z0-9_-]+$/.test(saltPart) || !/^[A-Za-z0-9_-]+$/.test(hashPart)) {
    return false;
  }
  const salt = Buffer.from(saltPart, "base64url");
  const expected = Buffer.from(hashPart, "base64url");
  if (salt.length !== SALT_BYTES || expected.length !== HASH_BYTES) {
    return false;
  }
  const derived = scryptSync(password, salt, HASH_BYTES);
  return derived.length === expected.length && timingSafeEqual(derived, expected);
}
