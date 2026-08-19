export const MIN_BALANCE_PAYMENT_TRY = 0.01;
export const MAX_BALANCE_PAYMENT_TRY = 1_000_000;
export const BALANCE_PAYMENT_SESSION_EXPIRY_HOURS = 24;

export interface BalancePaymentProviderBinding {
  merchantPaymentId?: string;
  providerSessionToken?: string;
  providerCustomerId: string;
}

export function parseBalancePaymentAmount(value: unknown): number | null {
  if (typeof value !== "number" && typeof value !== "string") return null;
  const normalized = typeof value === "string" ? value.trim().replace(",", ".") : value;
  if (typeof normalized === "string" && !/^\d+(?:\.\d{1,2})?$/.test(normalized)) return null;
  const amount = Number(normalized);
  if (!Number.isFinite(amount) || amount < 0) return null;
  if (Math.abs(amount * 100 - Math.round(amount * 100)) > 1e-8) return null;
  return roundMoney(amount);
}

export function balancePaymentError(amount: number | null): string | null {
  if (amount === null || amount < MIN_BALANCE_PAYMENT_TRY) {
    return "Geçerli bir ödeme tutarı girin.";
  }
  if (amount > MAX_BALANCE_PAYMENT_TRY) {
    return `Tek işlemde en fazla ${formatTry(MAX_BALANCE_PAYMENT_TRY)} ödeme yapılabilir.`;
  }
  return null;
}

export function balancePaymentProviderMatches(
  binding: BalancePaymentProviderBinding,
  callback: { merchantPaymentId: string; sessionToken: string; customerId: string }
): boolean {
  return Boolean(
    binding.merchantPaymentId &&
    binding.providerSessionToken &&
    binding.merchantPaymentId === callback.merchantPaymentId &&
    binding.providerSessionToken === callback.sessionToken &&
    binding.providerCustomerId === callback.customerId
  );
}

export function canCompleteBalancePayment(status: string): boolean {
  return status === "pending";
}

export function roundMoney(value: number): number {
  return Math.round((Number.isFinite(value) ? value : 0) * 100) / 100;
}

function formatTry(value: number): string {
  return new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY" }).format(value);
}
