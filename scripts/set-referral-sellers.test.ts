import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
// @ts-expect-error Standalone operational JS script, deliberately dependency-free.
import { planReferralSellers } from './set-referral-sellers.mjs';

const script = fileURLToPath(new URL('./set-referral-sellers.mjs', import.meta.url));
const hybrid = { enabled: true, mode: 'hybrid', productFeedEnabled: true, apiEnabled: true, exactStockEnabled: true, orderApiEnabled: true, blindShippingEnabled: true, defaultMarkupRate: 30, apiKeyHash: 'hash', apiKeyPrefix: 'entas_live_ab' };
const account = (patch: Record<string, unknown>) => ({ id: 'id', companyId: patch.id ?? 'id', email: 'x@example.test', password: 'scrypt$hash', authorizedPerson: 'Test', status: 'approved', sellerAccess: hybrid, ...patch });
const makeAccounts = () => [
  account({ id: 'eren', authorizedPerson: ' EREN Yılmaz ', email: 'eren@example.test', referral: undefined }),
  account({ id: 'by-email', authorizedPerson: 'Satış Ortağı', email: ' EntasEren@ZMKagency.com ' }),
  account({ id: 'reseller', authorizedPerson: 'Ali', email: 'ali@example.test' }),
  account({ id: 'customer-eren', authorizedPerson: 'Eren', sellerAccess: { ...hybrid, enabled: false } }),
  account({ id: 'employee-eren', companyId: 'eren', authorizedPerson: 'Eren' }),
  account({ id: 'buyer', authorizedPerson: 'Müşteri', referral: { sellerId: 'eren', sellerName: 'Eren' }, sellerAccess: { ...hybrid, enabled: false } })
];

describe('referral seller switch', () => {
  it('switches only Eren seller owners to referral, closes reseller tools and keeps everything else', () => {
    const before = makeAccounts();
    const result = planReferralSellers(before);
    expect(result.changes.map((c: { id: string }) => c.id)).toEqual(['eren', 'by-email']);
    expect(result.changes[1].email).toBe('En***@ZMKagency.com');
    for (const index of [0, 1]) {
      expect(result.accounts[index]).toEqual({ ...before[index], sellerAccess: { ...hybrid, mode: 'referral', productFeedEnabled: false, apiEnabled: false, exactStockEnabled: false, orderApiEnabled: false, blindShippingEnabled: false } });
    }
    for (const index of [2, 3, 4, 5]) expect(result.accounts[index]).toBe(before[index]);
    expect(before[0].sellerAccess.mode).toBe('hybrid');
    const again = planReferralSellers(result.accounts);
    expect(again.changes).toEqual([]);
    expect(again.alreadyReferral.map((c: { id: string }) => c.id)).toEqual(['eren', 'by-email']);
  });

  it('refuses a non-array accounts file', () => {
    expect(() => planReferralSellers({ accounts: [] })).toThrow('array');
  });

  it('applies atomically with a private backup, then reports done or no match through the exit code', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'entas-referral-'));
    try {
      const file = path.join(dir, 'customer-accounts.json');
      writeFileSync(file, JSON.stringify(makeAccounts(), null, 2) + '\n', { mode: 0o600 });
      const preview = spawnSync(process.execPath, [script, file], { encoding: 'utf8' });
      expect(preview.status).toBe(0);
      expect(JSON.parse(readFileSync(file, 'utf8'))[0].sellerAccess.mode).toBe('hybrid');

      const applied = spawnSync(process.execPath, [script, file, '--apply'], { encoding: 'utf8' });
      expect(applied.status).toBe(0);
      const saved = JSON.parse(readFileSync(file, 'utf8'));
      expect(saved.map((a: { sellerAccess: { mode: string } }) => a.sellerAccess.mode)).toEqual(['referral', 'referral', 'hybrid', 'hybrid', 'hybrid', 'hybrid']);
      expect(statSync(file).mode & 0o777).toBe(0o600);
      const backups = readdirSync(dir).filter(name => name.includes('.referral-backup-'));
      expect(backups).toHaveLength(1);
      expect(statSync(path.join(dir, backups[0]!)).mode & 0o777).toBe(0o600);
      expect(readdirSync(dir).some(name => name.includes('.referral-tmp-'))).toBe(false);

      expect(spawnSync(process.execPath, [script, file, '--apply'], { encoding: 'utf8' }).status).toBe(0);
      writeFileSync(file, JSON.stringify([makeAccounts()[2]]));
      expect(spawnSync(process.execPath, [script, file, '--apply'], { encoding: 'utf8' }).status).toBe(2);
      writeFileSync(file, '{broken');
      expect(spawnSync(process.execPath, [script, file, '--apply'], { encoding: 'utf8' }).status).toBe(1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
