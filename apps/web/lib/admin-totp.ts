import { createHmac } from "node:crypto";
import { constantTimeEqual } from "./security";

export function verifyTotp(code: string, base32Secret: string, now = Date.now()): boolean {
  if (!/^\d{6}$/.test(code.trim())) return false;
  let secret: Buffer;
  try {
    secret = decodeBase32(base32Secret);
  } catch {
    return false;
  }
  if (secret.length < 20) return false;
  const step = Math.floor(now / 30_000);
  return [-1, 0, 1].some((offset) => constantTimeEqual(code.trim(), totpAtStep(secret, step + offset)));
}

export function decodeBase32(value: string): Buffer {
  const normalized = value.toUpperCase().replace(/[\s=-]/g, "");
  if (!normalized || /[^A-Z2-7]/.test(normalized)) throw new Error("Geçersiz base32 değeri.");
  let bits = "";
  for (const character of normalized) {
    const index = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567".indexOf(character);
    bits += index.toString(2).padStart(5, "0");
  }
  const bytes: number[] = [];
  for (let offset = 0; offset + 8 <= bits.length; offset += 8) bytes.push(Number.parseInt(bits.slice(offset, offset + 8), 2));
  return Buffer.from(bytes);
}

function totpAtStep(secret: Buffer, step: number): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const digest = createHmac("sha1", secret).update(counter).digest();
  const offset = digest[digest.length - 1]! & 0x0f;
  const binary = (digest.readUInt32BE(offset) & 0x7fffffff) % 1_000_000;
  return String(binary).padStart(6, "0");
}
