import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { parseOcrModelCodeCandidates, parseOcrPhasePairs, shouldSkipPdfPage } from "./pdf-catalog-tools";

describe("PDF model code OCR", () => {
  it("normalizes common 4ST OCR mistakes and ignores measurement units", () => {
    const candidates = parseOcrModelCodeCandidates(`
      4STM3-4-6-8-16 DERIN KUYU
      ASTM8-12 | AST8-12 | 1.5 kW | 220V | 380V | 50Hz
      4STM16-16 | 4ST16-16 | AST16-20
      H(m) ASTM6-20, AST6-20
    `);

    expect(candidates).toContain("4STM8-12");
    expect(candidates).toContain("4ST8-12");
    expect(candidates).toContain("4STM16-16");
    expect(candidates).toContain("4ST16-16");
    expect(candidates).toContain("4ST16-20");
    expect(candidates).toContain("4STM6-20");
    expect(candidates).toContain("4ST6-20");
    expect(candidates).not.toContain("220V");
    expect(candidates).not.toContain("50HZ");
  });

  it("keeps only phase codes observed together on one OCR row", () => {
    const pairs = parseOcrPhasePairs(`
      ASTM6-8 | AST6-8 | 0.75 | 1
      4STM16-16 | 4ST16-16 | 4 | 5.5
      TLPM4-7
      TLP4-7
    `);

    expect(pairs).toEqual([
      { singlePhase: "4STM6-8", threePhase: "4ST6-8" },
      { singlePhase: "4STM16-16", threePhase: "4ST16-16" }
    ]);
  });
});

describe("PDF page skip", () => {
  it("sends textless scanned pages to vision analysis", () => {
    expect(shouldSkipPdfPage("", 2, 5)).toBe(false);
    expect(shouldSkipPdfPage("   \n\t", 3, 5)).toBe(false);
  });

  it("still skips short text-only cover fragments", () => {
    expect(shouldSkipPdfPage("Katalog kapagi", 1, 50)).toBe(true);
  });

  it("skips a standalone confidentiality notice before the back cover", () => {
    expect(shouldSkipPdfPage("Her hakkı saklıdır. Gizli ve özeldir.", 27, 28)).toBe(true);
  });
});
