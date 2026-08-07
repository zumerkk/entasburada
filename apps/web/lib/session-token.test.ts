import { describe, expect, it } from "vitest";
import { createSessionToken, verifySessionToken } from "./session-token";

const SECRET = "test-session-secret";
const HOUR = 60 * 60;

describe("session token", () => {
  it("round-trips the subject for a valid token", () => {
    const token = createSessionToken("cust-123", SECRET, HOUR);
    expect(verifySessionToken(token, SECRET)).toBe("cust-123");
  });

  it("preserves subjects that contain non-ascii and separator characters", () => {
    const subject = "bayi.İstanbul@örnek";
    const token = createSessionToken(subject, SECRET, HOUR);
    expect(verifySessionToken(token, SECRET)).toBe(subject);
  });

  it("creates a fresh unpredictable token for every session", () => {
    const first = createSessionToken("cust-123", SECRET, HOUR);
    const second = createSessionToken("cust-123", SECRET, HOUR);
    expect(first).not.toBe(second);
  });

  it("rejects a token signed with a different secret", () => {
    const token = createSessionToken("cust-123", SECRET, HOUR);
    expect(verifySessionToken(token, "other-secret")).toBeNull();
  });

  it("rejects a token whose signature was tampered with", () => {
    const token = createSessionToken("cust-123", SECRET, HOUR);
    const [version, subject, exp, signature] = token.split(".");
    const flipped = signature!.slice(0, -1) + (signature!.endsWith("A") ? "B" : "A");
    const forged = [version, subject, exp, flipped].join(".");
    expect(verifySessionToken(forged, SECRET)).toBeNull();
  });

  it("rejects a token whose subject was swapped without re-signing", () => {
    const token = createSessionToken("cust-123", SECRET, HOUR);
    const [version, , exp, signature] = token.split(".");
    const forgedSubject = Buffer.from("cust-999").toString("base64url");
    const forged = [version, forgedSubject, exp, signature].join(".");
    expect(verifySessionToken(forged, SECRET)).toBeNull();
  });

  it("rejects an expired token", () => {
    expect(() => createSessionToken("cust-123", SECRET, -1)).toThrow();
  });

  it("rejects empty, malformed, and wrong-version tokens", () => {
    expect(verifySessionToken("", SECRET)).toBeNull();
    expect(verifySessionToken("not-a-token", SECRET)).toBeNull();
    expect(verifySessionToken("v2.only.three", SECRET)).toBeNull();
    const valid = createSessionToken("cust-123", SECRET, HOUR);
    const [, subject, exp, signature] = valid.split(".");
    expect(verifySessionToken(["v3", subject, exp, signature].join("."), SECRET)).toBeNull();
  });

  it("rejects a token with a non-numeric expiry", () => {
    const [version, subject, , signature] = createSessionToken("cust-123", SECRET, HOUR).split(".");
    expect(verifySessionToken([version, subject, "not-a-number", signature].join("."), SECRET)).toBeNull();
  });
});
