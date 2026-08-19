import { describe, expect, it } from "vitest";
import {
  MAX_BALANCE_PAYMENT_TRY,
  balancePaymentError,
  balancePaymentProviderMatches,
  canCompleteBalancePayment,
  parseBalancePaymentAmount
} from "./customer-balance-payment-policy";

describe("customer balance payment policy", () => {
  it("accepts integer and two-decimal TRY amounts", () => {
    expect(parseBalancePaymentAmount(50_000)).toBe(50_000);
    expect(parseBalancePaymentAmount("10000,25")).toBe(10_000.25);
    expect(parseBalancePaymentAmount("999.9")).toBe(999.9);
  });

  it("rejects malformed, negative and over-precision values", () => {
    expect(parseBalancePaymentAmount("10.000,00")).toBeNull();
    expect(parseBalancePaymentAmount("100.999")).toBeNull();
    expect(parseBalancePaymentAmount("-10")).toBeNull();
    expect(parseBalancePaymentAmount(-10)).toBeNull();
    expect(parseBalancePaymentAmount(100.999)).toBeNull();
    expect(parseBalancePaymentAmount(Number.NaN)).toBeNull();
  });

  it("allows a valid manual amount without requiring a tracked site debt", () => {
    expect(balancePaymentError(10_000)).toBeNull();
    expect(balancePaymentError(50_000)).toBeNull();
    expect(balancePaymentError(0)).toContain("Geçerli");
  });

  it("limits a single card collection", () => {
    expect(balancePaymentError(MAX_BALANCE_PAYMENT_TRY)).toBeNull();
    expect(balancePaymentError(MAX_BALANCE_PAYMENT_TRY + 0.01)).toContain("en fazla");
  });

  it("requires an exact merchant, session and customer callback match", () => {
    const binding = {
      merchantPaymentId: "CBP123-attempt",
      providerSessionToken: "session-1",
      providerCustomerId: "customer-1"
    };
    expect(balancePaymentProviderMatches(binding, {
      merchantPaymentId: "CBP123-attempt",
      sessionToken: "session-1",
      customerId: "customer-1"
    })).toBe(true);
    expect(balancePaymentProviderMatches(binding, {
      merchantPaymentId: "CBP123-attempt",
      sessionToken: "other-session",
      customerId: "customer-1"
    })).toBe(false);
  });

  it("only completes a pending intent, preventing duplicate paid callbacks", () => {
    expect(canCompleteBalancePayment("pending")).toBe(true);
    expect(canCompleteBalancePayment("paid")).toBe(false);
    expect(canCompleteBalancePayment("failed")).toBe(false);
  });

});
