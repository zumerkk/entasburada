import { describe, expect, it } from "vitest";
import { deriveGridProductImageRegions, type GridProductIdentity, type PdfWordBox } from "./pdf-grid-image-regions";

describe("PDF grid image region derivation", () => {
  it("anchors repeated product cells to the model label directly below the image", () => {
    const models = ["3X16", "5X25", "7X25", "10X25", "3X19", "5X19"];
    const products: GridProductIdentity[] = models.map((model) => ({
      key: model,
      sku: `PDF-${model}`,
      manufacturerCode: "",
      name: `ELKA Garantili Metre ${model} MM`
    }));
    const words: PdfWordBox[] = [
      word("3X16MM", 77, 380),
      word("5X25MM", 547, 381),
      word("7X25MM", 77, 657),
      word("10X25MM", 547, 657),
      word("3X19MM", 77, 931),
      word("5X19MM", 547, 932)
    ];

    const regions = deriveGridProductImageRegions(products, words);
    expect(regions.size).toBe(6);
    expect(regions.get("10X25")).toMatchObject({ x: expect.closeTo(514, 0), y: expect.closeTo(426, 0), width: expect.closeTo(442, 0) });
    expect(regions.get("3X16")?.y).toBeLessThan(170);
    expect(regions.get("3X19")?.y).toBeGreaterThan(690);
  });

  it("does not infer a grid from sparse product labels", () => {
    const products: GridProductIdentity[] = [{ key: "A", sku: "A-10", manufacturerCode: "", name: "Pompa A-10" }];
    expect(deriveGridProductImageRegions(products, [word("A-10", 100, 500)])).toEqual(new Map());
  });

  it("maps a two-column product-card table to nearby embedded product images", () => {
    const products: GridProductIdentity[] = Array.from({ length: 6 }, (_, index) => ({
      key: `p${index + 1}`,
      sku: `EMKA-${index + 1}`,
      manufacturerCode: "",
      name: `EMKA ürün ${index + 1}`
    }));
    const words: PdfWordBox[] = [
      word("EMKA-1", 250, 250), word("EMKA-2", 750, 250),
      word("EMKA-3", 250, 500), word("EMKA-4", 750, 500),
      word("EMKA-5", 250, 750), word("EMKA-6", 750, 750)
    ];
    const embedded = [
      image(20, 205), image(520, 205),
      image(20, 455), image(520, 455),
      image(20, 705), image(520, 705)
    ];

    const regions = deriveGridProductImageRegions(products, words, embedded);

    expect(regions.size).toBe(6);
    expect(regions.get("p1")).toEqual(embedded[0]?.region);
    expect(regions.get("p4")).toEqual(embedded[3]?.region);
  });

  it("prefers the SKU token over package text in a product name", () => {
    const products: GridProductIdentity[] = Array.from({ length: 6 }, (_, index) => ({
      key: `sku-${index + 1}`,
      sku: `EMKA ${5500 + index}`,
      manufacturerCode: "",
      name: `Kademeli set 6 pcs ${index + 1}`
    }));
    const words: PdfWordBox[] = [
      word("5500", 250, 250), word("5501", 750, 250),
      word("5502", 250, 500), word("5503", 750, 500),
      word("5504", 250, 750), word("5505", 750, 750),
      word("6pcs", 920, 490)
    ];

    const regions = deriveGridProductImageRegions(products, words, [
      image(20, 205), image(520, 205),
      image(20, 455), image(520, 455),
      image(20, 705), image(520, 705)
    ]);

    expect(regions.size).toBe(6);
  });
});

function word(text: string, x: number, y: number): PdfWordBox {
  return { text, x, y, width: 70, height: 14 };
}

function image(x: number, y: number): { index: number; region: { x: number; y: number; width: number; height: number } } {
  return { index: x + y, region: { x, y, width: 170, height: 80 } };
}
