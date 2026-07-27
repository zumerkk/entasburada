/**
 * Kargo firmaları kayıt tablosu. Manuel takip: admin firma + takip no girer,
 * müşteri sipariş sayfasında firmanın takip sayfasına giden linki görür.
 * İleride firma API'si eklendiğinde bu tablo adaptör anahtarı olarak da kullanılabilir.
 */

export interface ShippingCarrier {
  key: string;
  label: string;
  /** Takip numarasından firmanın sorgu sayfası URL'i üretir. */
  trackingUrl: (trackingNumber: string) => string;
}

export const SHIPPING_CARRIERS: ShippingCarrier[] = [
  { key: "yurtici", label: "Yurtiçi Kargo", trackingUrl: (n) => `https://www.yurticikargo.com/tr/online-servisler/gonderi-sorgula?code=${encodeURIComponent(n)}` },
  { key: "aras", label: "Aras Kargo", trackingUrl: (n) => `https://kargotakip.araskargo.com.tr/CargoIntegration/CargoMovementByCode?code=${encodeURIComponent(n)}` },
  { key: "mng", label: "MNG Kargo", trackingUrl: (n) => `https://kargotakip.mngkargo.com.tr/?takipNo=${encodeURIComponent(n)}` },
  { key: "ptt", label: "PTT Kargo", trackingUrl: (n) => `https://gonderitakip.ptt.gov.tr/Track/Verify?q=${encodeURIComponent(n)}` },
  { key: "surat", label: "Sürat Kargo", trackingUrl: (n) => `https://www.suratkargo.com.tr/KargoTakip/?kargotakipno=${encodeURIComponent(n)}` },
  { key: "ups", label: "UPS Kargo", trackingUrl: (n) => `https://www.ups.com/track?tracknum=${encodeURIComponent(n)}` }
];

const byKey = new Map(SHIPPING_CARRIERS.map((c) => [c.key, c]));

export function getCarrier(key: string | undefined | null): ShippingCarrier | undefined {
  if (!key) return undefined;
  return byKey.get(key.trim().toLowerCase());
}

/** Firma + takip no'dan müşteriye gösterilecek takip linki (firma bilinmiyorsa null). */
export function buildTrackingUrl(carrierKey: string | undefined, trackingNumber: string | undefined): string | null {
  const carrier = getCarrier(carrierKey);
  const no = (trackingNumber ?? "").trim();
  if (!carrier || !no) return null;
  return carrier.trackingUrl(no);
}
