import { describe, expect, it } from "vitest";
import { sortLedgerDescending, summarizeLedger, type LedgerEntry } from "./customer-balance-policy";

function entry(partial: Partial<LedgerEntry> & Pick<LedgerEntry, "type" | "amount">): LedgerEntry {
  return {
    id: partial.id ?? Math.random().toString(36).slice(2),
    customerId: partial.customerId ?? "cust-1",
    date: partial.date ?? "2026-07-01T00:00:00.000Z",
    description: partial.description ?? "",
    createdAt: partial.createdAt ?? "2026-07-01T00:00:00.000Z",
    ...partial
  };
}

describe("customer balance policy", () => {
  it("derives balance as debit minus credit (positive means the dealer owes)", () => {
    const summary = summarizeLedger(
      [
        entry({ type: "debit", amount: "10000" }),
        entry({ type: "credit", amount: "4000" })
      ],
      "50000"
    );
    expect(summary.totalDebit).toBe(10000);
    expect(summary.totalCredit).toBe(4000);
    expect(summary.balance).toBe(6000);
    expect(summary.availableCredit).toBe(44000);
    expect(summary.overLimit).toBe(false);
  });

  it("flags an over-limit balance and reports the excess", () => {
    const summary = summarizeLedger([entry({ type: "debit", amount: "80000" })], "50000");
    expect(summary.balance).toBe(80000);
    expect(summary.availableCredit).toBe(-30000);
    expect(summary.overLimit).toBe(true);
    expect(summary.overLimitAmount).toBe(30000);
  });

  it("never flags over-limit when no credit limit is configured", () => {
    const summary = summarizeLedger([entry({ type: "debit", amount: "999999" })], "0");
    expect(summary.overLimit).toBe(false);
    expect(summary.overLimitAmount).toBe(0);
    expect(summary.availableCredit).toBe(-999999);
  });

  it("parses Turkish-formatted money strings", () => {
    const summary = summarizeLedger(
      [
        entry({ type: "debit", amount: "1.250,75" }),
        entry({ type: "credit", amount: "250,25" })
      ],
      "10.000,00"
    );
    expect(summary.balance).toBe(1000.5);
    expect(summary.creditLimit).toBe(10000);
    expect(summary.availableCredit).toBe(8999.5);
  });

  it("treats negative or malformed amounts as zero magnitude", () => {
    const summary = summarizeLedger(
      [
        entry({ type: "debit", amount: "-500" }),
        entry({ type: "credit", amount: "abc" }),
        entry({ type: "debit", amount: "300" })
      ],
      "1000"
    );
    expect(summary.balance).toBe(300);
  });

  it("reports entry count and the most recent entry date", () => {
    const summary = summarizeLedger(
      [
        entry({ type: "debit", amount: "100", date: "2026-05-10T00:00:00.000Z" }),
        entry({ type: "credit", amount: "40", date: "2026-07-15T00:00:00.000Z" }),
        entry({ type: "debit", amount: "20", date: "2026-06-01T00:00:00.000Z" })
      ],
      "1000"
    );
    expect(summary.entryCount).toBe(3);
    expect(summary.lastEntryAt).toBe("2026-07-15T00:00:00.000Z");
  });

  it("handles an empty ledger", () => {
    const summary = summarizeLedger([], "5000");
    expect(summary.balance).toBe(0);
    expect(summary.availableCredit).toBe(5000);
    expect(summary.entryCount).toBe(0);
    expect(summary.lastEntryAt).toBeNull();
  });

  it("sorts entries newest first, breaking ties by creation time", () => {
    const sorted = sortLedgerDescending([
      entry({ id: "a", type: "debit", amount: "1", date: "2026-01-01T00:00:00.000Z", createdAt: "2026-01-01T08:00:00.000Z" }),
      entry({ id: "b", type: "debit", amount: "1", date: "2026-03-01T00:00:00.000Z", createdAt: "2026-03-01T08:00:00.000Z" }),
      entry({ id: "c", type: "debit", amount: "1", date: "2026-03-01T00:00:00.000Z", createdAt: "2026-03-01T09:00:00.000Z" })
    ]);
    expect(sorted.map((e) => e.id)).toEqual(["c", "b", "a"]);
  });
});
