export const FREE_SHIPPING_THRESHOLD_TRY = 10_000;

export type BrandPriceAction = "discount" | "increase" | "net" | "hidden";

export interface BrandPricePolicy {
  canonicalBrand: string;
  action: BrandPriceAction;
  rate: number;
  ruleLabel: string;
  priceLabel?: string;
}

const DEFAULT_PRICE_POLICY: BrandPricePolicy = {
  canonicalBrand: "Diğer",
  action: "net",
  rate: 0,
  ruleLabel: "Ortak net fiyat",
  priceLabel: "Net"
};

const BRAND_PRICE_POLICIES: Array<BrandPricePolicy & { aliases: string[] }> = [
  { canonicalBrand: "ARC Boya", aliases: ["ARC BOYA", "ARC BANYO"], action: "discount", rate: 16, ruleLabel: "ARC Boya liste fiyatı - %16" },
  { canonicalBrand: "Doğal Plastik", aliases: ["DOGAL PLASTIK"], action: "discount", rate: 19, ruleLabel: "Doğal Plastik liste fiyatı - %19" },
  {
    canonicalBrand: "Euromix",
    aliases: ["EUROMIX"],
    action: "net",
    rate: 0,
    ruleLabel: "Euromix bayi neti - %15 alış iskontosu + %20 KDV + %30 kâr",
    priceLabel: "Net"
  },
  { canonicalBrand: "Floran", aliases: ["FLORAN", "FLOORPAN"], action: "hidden", rate: 0, ruleLabel: "Fiyat bilgisi verilmeyecek" },
  { canonicalBrand: "Forza", aliases: ["FORZA"], action: "discount", rate: 19, ruleLabel: "Forza liste fiyatı - %19" },
  { canonicalBrand: "İbeltech", aliases: ["IBELTECH"], action: "discount", rate: 11, ruleLabel: "İbeltech liste fiyatı - %11" },
  { canonicalBrand: "Jamindar", aliases: ["JAMINDAR", "LAMINDOOR"], action: "hidden", rate: 0, ruleLabel: "Fiyat bilgisi verilmeyecek" },
  { canonicalBrand: "Karen", aliases: ["KAREN"], action: "discount", rate: 30, ruleLabel: "Karen liste fiyatı - %30" },
  { canonicalBrand: "KF Kuzey Fittings", aliases: ["KF KUZEY FITTINGS", "KUZEY FITTINGS", "KF KUZEY"], action: "discount", rate: 30, ruleLabel: "KF Kuzey Fittings liste fiyatı - %30" },
  { canonicalBrand: "Mesem", aliases: ["MESEM"], action: "discount", rate: 22, ruleLabel: "Mesem liste fiyatı - %22" },
  { canonicalBrand: "MRS Max / Mırsan", aliases: ["MRSMAX", "MRS MAX", "MIRSAN"], action: "net", rate: 0, ruleLabel: "Net", priceLabel: "Net" },
  { canonicalBrand: "Onay Boya", aliases: ["ONAY", "ONAY BOYA"], action: "discount", rate: 9, ruleLabel: "Onay Boya liste fiyatı - %9" },
  { canonicalBrand: "Pimtaş Kaplin", aliases: ["PIMTAS", "PIMTAS KAPLIN"], action: "discount", rate: 11, ruleLabel: "Pimtaş Kaplin liste fiyatı - %11" },
  { canonicalBrand: "Sayım", aliases: ["SAYIM"], action: "discount", rate: 35, ruleLabel: "Sayım liste fiyatı - %35" },
  { canonicalBrand: "SGS", aliases: ["SGS"], action: "discount", rate: 19, ruleLabel: "SGS liste fiyatı - %19" },
  { canonicalBrand: "Tricraft", aliases: ["TRICRAFT"], action: "discount", rate: 22, ruleLabel: "Tricraft liste fiyatı - %22" }
];

/**
 * Kaynak bazli fiyat politikasi istisnalari (marka kuralindan once bakilir).
 *
 * NEDEN: Marka kurallari `listPrice`in bir SATIS LISTE FIYATI oldugunu varsayip
 * uzerine bayi iskontosu uygular. KAREN LED ayna listesi ise tedarikcinin ALIS
 * fiyat listesidir; Karen markasinin -%30 kurali uygulaninca bayi alis fiyatinin
 * %30 altini goruyordu (2026-08-25 denetim bulgusu, 19 urunde birim basina
 * -8.520 TL). Bu kaynakta `listPrice` artik NET satis fiyatidir (alis + %40 kar),
 * iskonto uygulanmaz.
 *
 * DIKKAT: Anahtar `sourceKey`dir. Ayni urunler yeni bir kaynak anahtariyla tekrar
 * ice aktarilirsa buraya da eklenmelidir; aksi halde sessizce marka iskontosuna
 * geri doner ve zarar tekrarlanir. `customer-pricing.test.ts` bunu sabitler.
 */
const SOURCE_PRICE_POLICIES: Record<string, BrandPricePolicy> = {
  "catalog-pdf-karen-led-ayna-2026": {
    canonicalBrand: "Karen LED Ayna",
    action: "net",
    rate: 0,
    ruleLabel: "Karen LED ayna net fiyati",
    priceLabel: "Net"
  }
};

/**
 * Bir urunun fiyat politikasi: once kaynak istisnasi, yoksa marka kurali.
 * Fiyat hesaplayan her yol bu fonksiyonu kullanmalidir.
 */
export function resolveProductPricePolicy(sourceKey: string, brand: string): BrandPricePolicy {
  return SOURCE_PRICE_POLICIES[sourceKey] ?? resolveBrandPricePolicy(brand);
}

export function resolveBrandPricePolicy(brand: string): BrandPricePolicy {
  const normalizedBrand = normalizeBrand(brand);
  const matched = BRAND_PRICE_POLICIES.find((policy) =>
    policy.aliases.some((alias) => normalizedBrand === alias || normalizedBrand.startsWith(`${alias} `))
  );

  if (!matched) return DEFAULT_PRICE_POLICY;
  return {
    canonicalBrand: matched.canonicalBrand,
    action: matched.action,
    rate: matched.rate,
    ruleLabel: matched.ruleLabel,
    ...(matched.priceLabel ? { priceLabel: matched.priceLabel } : {})
  };
}

export function priceMultiplier(policy: BrandPricePolicy): number {
  if (policy.action === "discount") return 1 - policy.rate / 100;
  if (policy.action === "increase") return 1 + policy.rate / 100;
  return 1;
}

export function includedVatAmount(grossAmount: number, taxRate: number): number {
  const safeGross = Number.isFinite(grossAmount) && grossAmount > 0 ? grossAmount : 0;
  const safeRate = Number.isFinite(taxRate) ? Math.min(100, Math.max(0, taxRate)) : 0;
  if (safeGross === 0 || safeRate === 0) return 0;
  return roundMoney((safeGross * safeRate) / (100 + safeRate));
}

export function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function normalizeBrand(value: string): string {
  return value
    .trim()
    .toLocaleUpperCase("tr-TR")
    .replace(/[Ç]/g, "C")
    .replace(/[Ğ]/g, "G")
    .replace(/[İI]/g, "I")
    .replace(/[Ö]/g, "O")
    .replace(/[Ş]/g, "S")
    .replace(/[Ü]/g, "U")
    .replace(/[^A-Z0-9]+/g, " ")
    .trim();
}
