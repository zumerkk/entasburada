import { describe, expect, it } from "vitest";
import { hashPassword, SCRYPT_PREFIX, verifyPassword } from "./password-hash";
import { createSessionToken, verifySessionToken } from "./session-token";

describe("password-hash", () => {
  it("hashler ve dogrular", () => {
    const hash = hashPassword("Gizli-Sifre-123!");
    expect(hash.startsWith(SCRYPT_PREFIX)).toBe(true);
    expect(verifyPassword("Gizli-Sifre-123!", hash)).toBe(true);
    expect(verifyPassword("yanlis-sifre", hash)).toBe(false);
  });

  it("ayni sifre icin farkli salt uretir", () => {
    expect(hashPassword("abc")).not.toBe(hashPassword("abc"));
  });

  it("eski duz metin kayitla geriye uyumlu", () => {
    expect(verifyPassword("duzmetin", "duzmetin")).toBe(true);
    expect(verifyPassword("baska", "duzmetin")).toBe(false);
    expect(verifyPassword("x", "")).toBe(false);
  });
});

describe("session-token", () => {
  it("imzali token uretir ve dogrular", () => {
    const token = createSessionToken("cust-42", "sir", 60);
    expect(verifySessionToken(token, "sir")).toBe("cust-42");
  });

  it("yanlis secret ile reddeder", () => {
    const token = createSessionToken("cust-42", "sir", 60);
    expect(verifySessionToken(token, "baska-sir")).toBeNull();
  });

  it("suresi dolmus tokeni reddeder", () => {
    const token = createSessionToken("cust-42", "sir", -10);
    expect(verifySessionToken(token, "sir")).toBeNull();
  });

  it("eski ciplak id cerezini reddeder", () => {
    expect(verifySessionToken("cust-test-project", "sir")).toBeNull();
  });
});
