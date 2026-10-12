import { describe, expect, it, vi } from "vitest";
import type { CatalogProductRecord } from "@entas/catalog";
import type { MaterialListRow } from "./material-list-parser";

vi.mock("server-only", () => ({}));
vi.mock("./catalog-repository", () => ({ loadCatalogStore: vi.fn() }));

import { matchMaterialRow } from "./project-repository";

const pressureReducer = { id: "kf-720", slug: "basinc-dusurucu-720", sku: "KFK-044-720", manufacturerCode: "720", name: "Rakorsuz Basınç Düşürücü 1/2 - 720", brand: "KF KUZEY FITTINGS", category: "Basınç Düşürücüler", categoryPath: ["Tesisat"], unitType: "Adet", status: "ACTIVE", isVisible: true, stockStatus: "in_stock" } as CatalogProductRecord;
const drillBit = { ...pressureReducer, id: "tricraft-720", slug: "hss-matkap-ucu-6-5-mm-720", sku: "720", manufacturerCode: "", name: "HSS Matkap Ucu Siyah/Beyaz DIN 338 - 6.5 mm", brand: "TRICRAFT", category: "Matkap Uçları", categoryPath: ["El Aletleri"] } as CatalogProductRecord;
const products = [pressureReducer, drillBit];
const row = (overrides: Partial<MaterialListRow> = {}): MaterialListRow => ({ sku: "720", productName: drillBit.name, quantity: 10, unit: "Adet", targetPrice: "", note: "", ...overrides });

describe("project product identity", () => {
  it("matches the requested drill bit despite an earlier manufacturer-code collision", () => {
    expect(matchMaterialRow(row(), products)).toMatchObject({ matchStatus: "EXACT", selectedMatch: { sku: "720", productSlug: drillBit.slug, productName: drillBit.name } });
  });
  it("leaves ambiguous code-only rows for explicit product selection", () => {
    const item = matchMaterialRow(row({ productName: "" }), products);
    expect(item.selectedMatch).toBeUndefined();
    expect(item.matchStatus).toBe("SUGGESTED");
    expect(item.alternatives.map((product) => product.productSlug)).toEqual([pressureReducer.slug, drillBit.slug]);
  });
  it("does not automatically select a search suggestion for a partial product name", () => {
    const item = matchMaterialRow(row({ sku: "", productName: "HSS Matkap" }), products);
    expect(item.selectedMatch).toBeUndefined();
    expect(item.matchStatus).toBe("SUGGESTED");
    expect(item.alternatives.some((product) => product.productSlug === drillBit.slug)).toBe(true);
  });
});
