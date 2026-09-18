import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
// @ts-expect-error Standalone operational JS script, deliberately dependency-free.
import { planArcRepair } from './repair-arc-banyo.mjs';

const manifest = JSON.parse(readFileSync(new URL('./catalog-data/arc-banyo-2025-02.json', import.meta.url), 'utf8'));
const makeStore = () => ({ products: [
  ...manifest.rows.map((r: any) => ({ ...r, sourceKey: manifest.sourceKey, brand: r.previousBrand, taxRate: '20', currency: 'TRY', stockQuantity: 7 })),
  { sourceKey: 'unrelated', sku: 'ALFA - 100cm', brand: 'OTHER', taxRate: '20', listPrice: '123.00' }
] });

describe('ARC catalog repair', () => {
  it('repairs all 212 rows, preserves raw prices and unrelated products, and is idempotent', () => {
    const before = makeStore();
    const result = planArcRepair(before, manifest);
    expect(result.changes).toHaveLength(212);
    expect(result.store.products[212]).toEqual(before.products[212]);
    result.store.products.slice(0, 212).forEach((p: any, i: number) => {
      expect(p.brand).toBe('ARC BANYO');
      expect(p.taxRate).toBe('10');
      expect(p.listPrice).toBe(before.products[i].listPrice);
      expect(p.stockQuantity).toBe(7);
    });
    expect(planArcRepair(result.store, manifest).changes).toEqual([]);
    expect(before.products[0].taxRate).toBe('20');
  });
  it('refuses partial catalogs and already converted prices', () => {
    const missing = makeStore();
    missing.products.shift();
    expect(() => planArcRepair(missing, manifest)).toThrow('212');
    const converted = makeStore();
    converted.products[0].listPrice = manifest.rows[0].dealerGrossPrice;
    expect(() => planArcRepair(converted, manifest)).toThrow('mismatch');
  });
});
