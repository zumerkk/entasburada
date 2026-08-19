export const EUROMIX_BUYING_DISCOUNT_RATE = 0;
export const EUROMIX_VAT_RATE = 20;
export const EUROMIX_PROFIT_RATE = 40;
export const EUROMIX_PORTAL_PRICE_MULTIPLIER = 1.68;

/**
 * Euromix bayi portalindaki KDV haric net fiyati, sitede gosterilecek KDV dahil
 * satis fiyatina cevirir: alis iskontosu yok, +%20 KDV, +%40 kar.
 */
export function calculateEuromixPortalSalePrice(portalNetPrice: number): number {
  if (!Number.isFinite(portalNetPrice) || portalNetPrice <= 0) {
    throw new Error("Euromix portal net fiyati sifirdan buyuk olmalidir.");
  }

  return roundMoney(portalNetPrice * EUROMIX_PORTAL_PRICE_MULTIPLIER);
}

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
