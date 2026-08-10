import "server-only";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

const VERSION = "v1";
const IV_BYTES = 12;

/**
 * Bayi gecici sifresini kalici veri dosyasina duz metin yazmadan saklar.
 * AES-GCM hem sifreleme hem de veri butunlugu saglar.
 */
export function sealTemporaryCredential(plainText: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", credentialKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plainText, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return [VERSION, iv.toString("base64url"), encrypted.toString("base64url"), tag.toString("base64url")].join(".");
}

export function openTemporaryCredential(sealed: string | undefined): string | null {
  if (!sealed) return null;

  try {
    const [version, ivPart, encryptedPart, tagPart] = sealed.split(".");
    if (version !== VERSION || !ivPart || !encryptedPart || !tagPart) return null;

    const iv = Buffer.from(ivPart, "base64url");
    const encrypted = Buffer.from(encryptedPart, "base64url");
    const tag = Buffer.from(tagPart, "base64url");
    if (iv.length !== IV_BYTES || tag.length !== 16) return null;

    const decipher = createDecipheriv("aes-256-gcm", credentialKey(), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}

function credentialKey(): Buffer {
  const secret =
    process.env.DEALER_CREDENTIAL_SECRET?.trim() ||
    process.env.ADMIN_SESSION_SECRET?.trim() ||
    process.env.AUTH_SECRET?.trim();

  if (!secret || (process.env.NODE_ENV === "production" && secret.length < 32)) {
    throw new Error("Bayi gecici sifrelerini koruyacak sunucu anahtari yapilandirilmamis.");
  }

  return createHash("sha256").update(secret, "utf8").digest();
}
