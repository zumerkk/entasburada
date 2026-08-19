import { describe, expect, it } from "vitest";
import {
  EUROMIX_PORTAL_PRICE_MULTIPLIER,
  calculateEuromixPortalSalePrice
} from "./euromix-pricing";

describe("Euromix portal pricing", () => {
  it("applies 20% VAT and 40% profit without a buying discount", () => {
    expect(EUROMIX_PORTAL_PRICE_MULTIPLIER).toBe(1.2 * 1.4);
    expect(calculateEuromixPortalSalePrice(366.56)).toBe(615.82);
  });

  it("rejects missing portal prices instead of publishing a stale value", () => {
    expect(() => calculateEuromixPortalSalePrice(0)).toThrow("sifirdan buyuk");
  });
});
