/**
 * Preview: node scripts/repair-arc-banyo.mjs /absolute/path/catalog-store.json
 * Apply during a maintenance window, with the web writer stopped:
 * node scripts/repair-arc-banyo.mjs /absolute/path/catalog-store.json --apply
 * Deploy commercial-policy.ts in the same maintenance window.
 * Never substitute the incomplete local catalog for the live catalog.
 */
import { readFile, writeFile, copyFile, rename } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export function planArcRepair(store, manifest) {
  if (manifest.sourceKey !== 'catalog-pdfler-fiyat-listesi-subat-2025' || manifest.rows.length !== 212) {
    throw new Error('Unexpected ARC manifest');
  }
  const bySku = new Map(manifest.rows.map(row => [row.sku, row]));
  const targets = store.products.filter(p => p.sourceKey === manifest.sourceKey);
  if (bySku.size !== 212 || targets.length !== 212 || new Set(targets.map(p => p.sku)).size !== 212) {
    throw new Error('Expected exactly 212 distinct ARC products; nothing written');
  }
  const changes = [];
  const products = store.products.map(product => {
    if (product.sourceKey !== manifest.sourceKey) return product;
    const row = bySku.get(product.sku);
    if (!row || row.slug !== product.slug || !['ARC BANYO', 'Marka Bekliyor'].includes(product.brand)) {
      throw new Error(`Unexpected product identity: ${product.sku}`);
    }
    const raw = String(product.listPrice).trim();
    const current = Number(raw.includes(',') ? raw.replaceAll('.', '').replace(',', '.') : raw);
    // Refuse to apply another discount to an already converted sale price.
    if (current !== Number(row.listPrice) || !['TRY', 'TL'].includes(product.currency)) {
      throw new Error(`PDF list price/currency mismatch: ${product.sku}; review before applying`);
    }
    if (product.brand === row.brand && String(product.taxRate) === row.taxRate) return product;
    changes.push({ sku: product.sku, before: { brand: product.brand, taxRate: product.taxRate }, after: { brand: row.brand, taxRate: row.taxRate }, dealerGrossPrice: row.dealerGrossPrice });
    return { ...product, brand: row.brand, taxRate: row.taxRate, updatedAt: new Date().toISOString() };
  });
  return { store: { ...store, products, ...(changes.length ? { updatedAt: new Date().toISOString() } : {}) }, changes };
}

async function main() {
  const input = process.argv[2];
  if (!input || input.startsWith('--')) throw new Error('An explicit catalog-store.json path is required');
  const catalogPath = path.resolve(input);
  const original = await readFile(catalogPath, 'utf8');
  const manifest = JSON.parse(await readFile(new URL('./catalog-data/arc-banyo-2025-02.json', import.meta.url), 'utf8'));
  const result = planArcRepair(JSON.parse(original), manifest);
  console.log(JSON.stringify({ mode: process.argv.includes('--apply') ? 'apply' : 'preview', count: result.changes.length, changes: result.changes }, null, 2));
  if (!process.argv.includes('--apply') || !result.changes.length) return;
  if (await readFile(catalogPath, 'utf8') !== original) throw new Error('Catalog changed during preview; retry with the web writer stopped');
  const stamp = Date.now();
  const backup = `${catalogPath}.arc-backup-${stamp}`;
  const temporary = `${catalogPath}.arc-tmp-${stamp}`;
  await copyFile(catalogPath, backup);
  await writeFile(temporary, JSON.stringify(result.store, null, 2) + '\n', { flag: 'wx' });
  if (await readFile(catalogPath, 'utf8') !== original) throw new Error('Concurrent catalog write detected; original retained');
  await rename(temporary, catalogPath);
  console.log(`Updated ${result.changes.length} products. Backup: ${backup}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
