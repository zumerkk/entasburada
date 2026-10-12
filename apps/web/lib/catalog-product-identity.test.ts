import { describe, expect, it } from "vitest";
import type { CatalogProductRecord } from "@entas/catalog";
import { createCatalogProductLookup, resolveCatalogProduct } from "./catalog-product-identity";

const heater = { id: "heater", slug: "webasto-isitici", sku: "191", name: "MUR-CELL Webasto Dizel Isıtıcı", manufacturerCode: "5202" } as CatalogProductRecord;
const drill = { id: "drill", slug: "elmas-matkap-ucu-7x100", sku: "5202", name: "TRICRAFT Elmas Matkap Ucu 7x100" } as CatalogProductRecord;
const saw = { id: "saw", slug: "mrsmax-testere", sku: "191", name: "MRSMAX Benzinli Zincirli Testere" } as CatalogProductRecord;
const lookup = createCatalogProductLookup([heater, drill, saw]);

describe("catalog product identity", () => {
  it("preserves a selected product even when its code belongs to another product too", () => {
    expect(resolveCatalogProduct(lookup, { productSlug: drill.slug, sku: drill.sku, productName: drill.name }).product).toBe(drill);
    expect(resolveCatalogProduct(lookup, { catalogProductId: saw.id, productSlug: saw.slug, sku: saw.sku, productName: saw.name }).product).toBe(saw);
  });

  it("disambiguates legacy codes only by the complete exact product name", () => {
    expect(resolveCatalogProduct(lookup, { sku: "191", productName: saw.name }).product).toBe(saw);
    expect(resolveCatalogProduct(lookup, { sku: "5202", productName: drill.name }).product).toBe(drill);
    expect(resolveCatalogProduct(lookup, { sku: "191" }).reason).toBe("ambiguous");
    expect(resolveCatalogProduct(lookup, { sku: "191", productName: "Testere" }).reason).toBe("mismatch");
  });

  it("rejects contradictory or removed strong identities without falling back to SKU", () => {
    expect(resolveCatalogProduct(lookup, { catalogProductId: heater.id, productSlug: drill.slug, sku: drill.sku }).reason).toBe("mismatch");
    expect(resolveCatalogProduct(lookup, { productSlug: heater.slug, sku: saw.sku, productName: saw.name }).reason).toBe("mismatch");
    expect(resolveCatalogProduct(lookup, { productSlug: drill.slug, sku: "999" }).reason).toBe("mismatch");
    expect(resolveCatalogProduct(lookup, { catalogProductId: "removed", sku: drill.sku, productName: drill.name }).reason).toBe("missing");
    expect(resolveCatalogProduct(lookup, { productSlug: "removed", sku: drill.sku, productName: drill.name }).reason).toBe("missing");
  });

  it("never uses a partial name, a substring code, or a name to override an unknown code", () => {
    expect(resolveCatalogProduct(lookup, { productName: "Matkap Ucu" }).product).toBeUndefined();
    expect(resolveCatalogProduct(lookup, { sku: "7x100" }).product).toBeUndefined();
    expect(resolveCatalogProduct(lookup, { sku: "OLD-CODE", productName: drill.name }).product).toBeUndefined();
    expect(resolveCatalogProduct(lookup, { productName: drill.name }).product).toBe(drill);
  });

  it("rejects duplicate slugs and duplicate names instead of selecting the first", () => {
    const duplicate = { ...drill, id: "second-drill" };
    const duplicated = createCatalogProductLookup([drill, duplicate]);
    expect(resolveCatalogProduct(duplicated, { productSlug: drill.slug, sku: drill.sku }).reason).toBe("ambiguous");
    expect(resolveCatalogProduct(duplicated, { productName: drill.name }).reason).toBe("ambiguous");
    expect(resolveCatalogProduct(duplicated, { sku: drill.sku, productName: drill.name }).reason).toBe("ambiguous");
  });
});
