import "server-only";

/**
 * Döviz kuru çevrimi (TCMB günlük kurları).
 *
 * NEDEN: Katalogda USD/EUR fiyatlı ürünler var ama tahsilat TRY yapılıyor.
 * Çevrim yapılmazsa 249.60 USD, 249.60 TRY olarak tahsil edilir (~47 kat eksik).
 *
 * GÜVENLİK KURALI: Kur alınamazsa ASLA tahmini/eski bir kurla tahsilat yapılmaz —
 * hata fırlatılır. Yanlış tutar tahsil etmek, ödemeyi reddetmekten daha kötüdür.
 *
 * Kaynak: https://www.tcmb.gov.tr/kurlar/today.xml (ForexSelling = döviz satış)
 * Marj: FX_MARGIN_PERCENT env'i ile kur riski payı eklenebilir (varsayılan 0).
 */

const TCMB_URL = "https://www.tcmb.gov.tr/kurlar/today.xml";
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 saat (TCMB günde bir güncellenir)

export interface FxRate {
  currency: string;
  /** 1 birim dövizin TRY karşılığı (marj dahil). */
  rate: number;
  /** Marj öncesi TCMB döviz satış kuru. */
  baseRate: number;
  marginPercent: number;
  fetchedAt: string;
}

export interface ConversionResult {
  /** Çevrilmiş tutar (TRY, 2 ondalık). */
  amount: number;
  currency: "TRY";
  /** Kaynak tutar ve para birimi (kayıt/gösterim için). */
  sourceAmount: number;
  sourceCurrency: string;
  rate: number;
  rateFetchedAt: string;
}

let cache: { rates: Map<string, FxRate>; at: number } | null = null;

function marginPercent(): number {
  const raw = Number(process.env.FX_MARGIN_PERCENT ?? "0");
  if (!Number.isFinite(raw) || raw < 0 || raw > 25) return 0;
  return raw;
}

export function normalizeCurrencyCode(value: string | undefined | null): string {
  const code = (value ?? "").trim().toUpperCase();
  if (!code || code === "TL" || code === "₺") return "TRY";
  return code;
}

/** TCMB kurlarını çeker (1 saat önbellekli). Başarısız olursa hata fırlatır. */
export async function getFxRates(): Promise<Map<string, FxRate>> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.rates;

  const response = await fetch(TCMB_URL, { signal: AbortSignal.timeout(15_000) });
  if (!response.ok) {
    throw new Error(`TCMB kur servisi yanıt vermedi (HTTP ${response.status}).`);
  }
  const xml = await response.text();
  const margin = marginPercent();
  const fetchedAt = new Date().toISOString();
  const rates = new Map<string, FxRate>();

  // <Currency ... CurrencyCode="USD"> ... <Unit>1</Unit> ... <ForexSelling>47.39</ForexSelling>
  for (const match of xml.matchAll(/<Currency[^>]*CurrencyCode="([A-Z]{3})"[\s\S]*?<\/Currency>/g)) {
    const currency = match[1]!;
    const block = match[0];
    const unit = Number(block.match(/<Unit>([\d.,]+)<\/Unit>/)?.[1]?.replace(",", ".") ?? "1") || 1;
    const selling = Number(block.match(/<ForexSelling>([\d.,]+)<\/ForexSelling>/)?.[1]?.replace(",", ".") ?? "");
    if (!Number.isFinite(selling) || selling <= 0) continue;

    const baseRate = selling / unit;
    rates.set(currency, {
      currency,
      baseRate,
      marginPercent: margin,
      rate: baseRate * (1 + margin / 100),
      fetchedAt
    });
  }

  if (rates.size === 0) {
    throw new Error("TCMB kur listesi ayrıştırılamadı.");
  }

  rates.set("TRY", { currency: "TRY", baseRate: 1, marginPercent: 0, rate: 1, fetchedAt });
  cache = { rates, at: Date.now() };
  return rates;
}

/**
 * Verilen tutarı TRY'ye çevirir. TRY ise dokunmaz.
 * Kur bulunamazsa hata fırlatır — yanlış tutarla tahsilat yapılmaz.
 */
export async function convertToTry(amount: number, currency: string): Promise<ConversionResult> {
  const source = normalizeCurrencyCode(currency);
  if (!Number.isFinite(amount) || amount < 0) {
    throw new Error("Geçersiz tutar.");
  }

  if (source === "TRY") {
    return {
      amount: round2(amount),
      currency: "TRY",
      sourceAmount: round2(amount),
      sourceCurrency: "TRY",
      rate: 1,
      rateFetchedAt: new Date().toISOString()
    };
  }

  const rates = await getFxRates();
  const fx = rates.get(source);
  if (!fx) {
    throw new Error(`${source} için TCMB kuru bulunamadı; tahsilat yapılamaz.`);
  }

  return {
    amount: round2(amount * fx.rate),
    currency: "TRY",
    sourceAmount: round2(amount),
    sourceCurrency: source,
    rate: fx.rate,
    rateFetchedAt: fx.fetchedAt
  };
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
