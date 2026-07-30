/**
 * Taksit komisyon oranları ve müşteriye yansıtılan taksitli fiyat hesabı.
 *
 * Oranlar ZiraatPay panelindeki "Komisyon Oranı" tablosundan (TRY / Varsayılan satırı).
 * ⚠️ Panelde oran değişirse burası da güncellenmeli; INSTALLMENT_RATES_JSON env'i ile
 * kod değiştirmeden override edilebilir.
 *
 * POLİTİKA — "sadece taksit farkı":
 *   Tek çekim komisyonunu (%3,39) satıcı üstlenir; tek çekim fiyatı liste fiyatıdır.
 *   Taksitte yalnızca tek çekimin ÜSTÜNDEKİ fark müşteriye yansıtılır.
 *     efektifOran = oran[N] - oran[1]
 *
 * HESAP YÖNTEMİ (net-koruyan): Banka komisyonu müşterinin ödediği tutardan keser.
 * Satıcının net olarak baz tutarı alması için:
 *     müşteriTutarı = baz / (1 - efektifOran/100)
 * Basit çarpma (baz * (1 + oran/100)) kullanılırsa satıcı eksik alır.
 */

/** Taksit sayısı → komisyon yüzdesi. 1 = tek çekim. */
export const DEFAULT_INSTALLMENT_RATES: Record<number, number> = {
  1: 3.39,
  2: 5.76,
  3: 7.63,
  4: 9.5,
  5: 11.37,
  6: 13.24,
  7: 15.11,
  8: 16.98,
  9: 18.85,
  10: 20.71,
  11: 22.58,
  12: 24.45
};

export interface InstallmentOption {
  /** Taksit sayısı (1 = tek çekim). */
  count: number;
  /** Panelde yazan ham komisyon oranı (bilgi amaçlı gösterim için). */
  commissionRate: number;
  /** Müşteriye yansıtılan efektif oran = oran[N] - oran[1]. */
  effectiveRate: number;
  /** Müşterinin ödeyeceği toplam (komisyon dahil, TRY). */
  total: number;
  /** Aylık taksit tutarı. */
  monthly: number;
  /** Baz tutar üzerine eklenen komisyon farkı. */
  commissionAmount: number;
}

function loadRates(): Record<number, number> {
  const raw = process.env.INSTALLMENT_RATES_JSON?.trim();
  if (!raw) return DEFAULT_INSTALLMENT_RATES;
  try {
    const parsed = JSON.parse(raw) as Record<string, number>;
    const rates: Record<number, number> = {};
    for (const [key, value] of Object.entries(parsed)) {
      const count = Number(key);
      if (Number.isInteger(count) && count >= 1 && count <= 12 && Number.isFinite(value) && value >= 0 && value < 100) {
        rates[count] = value;
      }
    }
    return Object.keys(rates).length > 0 ? rates : DEFAULT_INSTALLMENT_RATES;
  } catch {
    return DEFAULT_INSTALLMENT_RATES;
  }
}

/**
 * Belirli bir taksit sayısı için müşteri tutarını hesaplar.
 * Politika: tek çekim komisyonu satıcıda kalır, sadece taksit farkı yansıtılır.
 */
export function priceForInstallment(baseAmount: number, count: number): InstallmentOption {
  const rates = loadRates();
  const commissionRate = rates[count] ?? 0;
  const singleRate = rates[1] ?? 0;
  // Tek çekimin üstündeki fark yansıtılır; negatifse (oran düşükse) sıfırlanır.
  const effectiveRate = Math.max(0, commissionRate - singleRate);
  const total = effectiveRate > 0 ? baseAmount / (1 - effectiveRate / 100) : baseAmount;
  const rounded = round2(total);
  return {
    count,
    commissionRate,
    effectiveRate: round2(effectiveRate),
    total: rounded,
    monthly: round2(rounded / count),
    commissionAmount: round2(rounded - baseAmount)
  };
}

/** Tüm taksit seçeneklerini (tek çekim dahil) hesaplar — sepette/ödemede göstermek için. */
export function installmentOptions(baseAmount: number, maxCount = 12): InstallmentOption[] {
  const rates = loadRates();
  return Object.keys(rates)
    .map(Number)
    .filter((count) => count >= 1 && count <= maxCount)
    .sort((a, b) => a - b)
    .map((count) => priceForInstallment(baseAmount, count));
}

/** Geçerli taksit sayısı mı? (form girdisi doğrulama) */
export function isValidInstallmentCount(value: unknown): boolean {
  const count = Number(value);
  return Number.isInteger(count) && count >= 1 && count <= 12 && loadRates()[count] !== undefined;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
