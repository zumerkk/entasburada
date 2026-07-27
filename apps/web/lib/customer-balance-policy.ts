import { parseMoney } from "./customer-pricing";

export type LedgerEntryType = "debit" | "credit";
export type LedgerRefType = "order" | "payment" | "manual" | "opening";

export interface LedgerEntry {
  id: string;
  customerId: string;
  /** İşlem tarihi (ISO) — muhasebe/valör tarihi. */
  date: string;
  type: LedgerEntryType;
  /** Pozitif tutar (TRY, string). İşaret `type` alanından gelir. */
  amount: string;
  description: string;
  refType?: LedgerRefType;
  refId?: string;
  createdBy?: string;
  /** Kaydın oluşturulma anı (ISO). */
  createdAt: string;
}

export interface BalanceSummary {
  /** Borç − Alacak. Pozitif = müşteri borçlu. */
  balance: number;
  totalDebit: number;
  totalCredit: number;
  creditLimit: number;
  /** Kredi limiti − bakiye. Negatifse limit aşılmıştır. */
  availableCredit: number;
  overLimit: boolean;
  /** Limit aşıldıysa aşım tutarı (pozitif), aksi halde 0. */
  overLimitAmount: number;
  currency: string;
  entryCount: number;
  lastEntryAt: string | null;
}

/**
 * Bir müşterinin defter hareketlerinden cari bakiye özetini türetir.
 *
 * İş kuralı: borç (debit) müşterinin borcunu artırır, alacak (credit) azaltır.
 * Kullanılabilir kredi = kredi limiti − güncel bakiye; negatifse limit aşımı.
 * Limit "0" ise limit takibi yapılmaz (overLimit her zaman false).
 */
export function summarizeLedger(
  entries: LedgerEntry[],
  creditLimitRaw: string | number | undefined,
  currency = "TRY"
): BalanceSummary {
  let totalDebit = 0;
  let totalCredit = 0;
  let lastEntryAt: string | null = null;

  for (const entry of entries) {
    const amount = Math.max(0, parseMoney(entry.amount));
    if (entry.type === "credit") {
      totalCredit += amount;
    } else {
      totalDebit += amount;
    }
    if (!lastEntryAt || entry.date > lastEntryAt) {
      lastEntryAt = entry.date;
    }
  }

  const balance = round2(totalDebit - totalCredit);
  const creditLimit =
    typeof creditLimitRaw === "number" ? creditLimitRaw : parseMoney(creditLimitRaw ?? "0");
  const hasLimit = creditLimit > 0;
  const availableCredit = round2(creditLimit - balance);
  const overLimit = hasLimit && availableCredit < 0;

  return {
    balance,
    totalDebit: round2(totalDebit),
    totalCredit: round2(totalCredit),
    creditLimit,
    availableCredit,
    overLimit,
    overLimitAmount: overLimit ? round2(-availableCredit) : 0,
    currency,
    entryCount: entries.length,
    lastEntryAt
  };
}

/** Bir müşteriye ait hareketleri tarihe göre (yeni → eski) sıralar. */
export function sortLedgerDescending(entries: LedgerEntry[]): LedgerEntry[] {
  return [...entries].sort((a, b) => {
    if (a.date !== b.date) {
      return a.date < b.date ? 1 : -1;
    }
    return a.createdAt < b.createdAt ? 1 : -1;
  });
}

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
