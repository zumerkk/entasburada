import { describe, expect, it } from "vitest";
import { decodeBase32, verifyTotp } from "./admin-totp";

describe("admin TOTP", () => {
  it("decodes RFC 4648 base32", () => {
    expect(decodeBase32("JBSWY3DPEBLW64TMMQ======").toString("utf8")).toBe("Hello World");
  });

  it("verifies a known RFC 6238-style six digit code", () => {
    const secret = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";
    expect(verifyTotp("287082", secret, 59_000)).toBe(true);
    expect(verifyTotp("000000", secret, 59_000)).toBe(false);
  });
});
