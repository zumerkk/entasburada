import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { openTemporaryCredential, sealTemporaryCredential } from "./temporary-credential";

const originalAdminSecret = process.env.ADMIN_SESSION_SECRET;
const originalDealerSecret = process.env.DEALER_CREDENTIAL_SECRET;

describe("temporary dealer credential vault", () => {
  beforeEach(() => {
    process.env.ADMIN_SESSION_SECRET = "test-admin-session-secret-with-more-than-32-characters";
    delete process.env.DEALER_CREDENTIAL_SECRET;
  });

  afterEach(() => {
    if (originalAdminSecret === undefined) delete process.env.ADMIN_SESSION_SECRET;
    else process.env.ADMIN_SESSION_SECRET = originalAdminSecret;

    if (originalDealerSecret === undefined) delete process.env.DEALER_CREDENTIAL_SECRET;
    else process.env.DEALER_CREDENTIAL_SECRET = originalDealerSecret;
  });

  it("encrypts and decrypts a temporary password without storing plaintext", () => {
    const password = "Entas-K7KM-Q4T7!";
    const sealed = sealTemporaryCredential(password);

    expect(sealed).not.toContain(password);
    expect(openTemporaryCredential(sealed)).toBe(password);
  });

  it("rejects a modified encrypted credential", () => {
    const sealed = sealTemporaryCredential("Entas-K7KM-Q4T7!");
    const parts = sealed.split(".");
    const encrypted = parts[2]!;
    parts[2] = `${encrypted[0] === "A" ? "B" : "A"}${encrypted.slice(1)}`;
    const tampered = parts.join(".");

    expect(openTemporaryCredential(tampered)).toBeNull();
  });

  it("cannot decrypt with a different server key", () => {
    const sealed = sealTemporaryCredential("Entas-K7KM-Q4T7!");
    process.env.ADMIN_SESSION_SECRET = "another-admin-session-secret-with-more-than-32-characters";

    expect(openTemporaryCredential(sealed)).toBeNull();
  });
});
