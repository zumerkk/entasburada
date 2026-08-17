import { describe, expect, it } from "vitest";
import {
  EUROMIX_PORTAL_PRICE_MULTIPLIER,
  calculateEuromixPortalSalePrice
} from "./euromix-pricing";

describe("Euromix portal pricing", () => {
  it("applies the 15% buying discount, 20% VAT and 30% profit in order", () => {
    expect(EUROMIX_PORTAL_PRICE_MULTIPLIER).toBe(0.85 * 1.2 * 1.3);
    expect(calculateEuromixPortalSalePrice(366.56)).toBe(486.06);
  });

  it("rejects missing portal prices instead of publishing a stale value", () => {
    expect(() => calculateEuromixPortalSalePrice(0)).toThrow("sifirdan buyuk");
  });
});
