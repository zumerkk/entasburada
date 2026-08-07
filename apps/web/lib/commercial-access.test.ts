import { describe, expect, it } from "vitest";
import { canAccessCommercialRecord, isCommercialRecordOwner, isSecureTrackingCapability } from "./commercial-access";

describe("commercial access", () => {
  const secureRecord = { email: "buyer@example.com", trackingCode: `T${"A1".repeat(16)}` };

  it("treats only 128-bit tracking codes as guest capabilities", () => {
    expect(isSecureTrackingCapability(secureRecord.trackingCode)).toBe(true);
    expect(isSecureTrackingCapability("T12345678")).toBe(false);
  });

  it("allows the owner and a strong guest capability but rejects legacy guest codes", () => {
    expect(canAccessCommercialRecord(secureRecord, { email: "BUYER@example.com" })).toBe(true);
    expect(canAccessCommercialRecord(secureRecord, null)).toBe(true);
    expect(canAccessCommercialRecord({ ...secureRecord, trackingCode: "T12345678" }, null)).toBe(false);
    expect(isCommercialRecordOwner(secureRecord, { email: "other@example.com" })).toBe(false);
  });
});
