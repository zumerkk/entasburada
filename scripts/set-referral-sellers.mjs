/**
 * One-time switch of referral-only marketers (Eren) to seller mode "referral" (Pazarlamacı),
 * so they see the same prices as the customers they bring instead of the +20% seller channel price.
 * Preview: node scripts/set-referral-sellers.mjs /absolute/path/customer-accounts.json
 * Apply with the web writer stopped (docker-entrypoint runs it before next start):
 * node scripts/set-referral-sellers.mjs /absolute/path/customer-accounts.json --apply
 * Exit codes: 0 done (switched or already referral), 2 no matching seller account, 1 error.
 */
import { createHash } from 'node:crypto';
import { readFile, writeFile, copyFile, chmod, rename } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const REFERRAL_FIRST_NAMES = new Set(['eren']);
// sha256 of the normalized login e-mail; the repository is public, so the address itself is not stored.
const REFERRAL_EMAIL_SHA256 = new Set(['a02ff66b64d5e9a19f20119ef00249d939749208166daa8a3efb83d6eca505cf']);
const RESELLER_TOOLS = ['productFeedEnabled', 'apiEnabled', 'exactStockEnabled', 'orderApiEnabled', 'blindShippingEnabled'];

export function isReferralMarketer(account) {
  if (!account?.sellerAccess?.enabled || (account.companyId ?? account.id) !== account.id) return false;
  const firstName = String(account.authorizedPerson ?? '').trim().toLocaleLowerCase('tr-TR').split(/\s+/)[0];
  const emailHash = createHash('sha256').update(String(account.email ?? '').trim().toLowerCase()).digest('hex');
  return REFERRAL_FIRST_NAMES.has(firstName) || REFERRAL_EMAIL_SHA256.has(emailHash);
}

export function planReferralSellers(accounts) {
  if (!Array.isArray(accounts)) throw new Error('customer-accounts.json must contain an array; nothing written');
  const changes = [];
  const alreadyReferral = [];
  const next = accounts.map(account => {
    if (!isReferralMarketer(account)) return account;
    const summary = { id: account.id, authorizedPerson: account.authorizedPerson, email: maskEmail(account.email) };
    const access = account.sellerAccess;
    if (access.mode === 'referral' && RESELLER_TOOLS.every(tool => !access[tool])) {
      alreadyReferral.push(summary);
      return account;
    }
    changes.push({ ...summary, previousMode: access.mode });
    return { ...account, sellerAccess: { ...access, mode: 'referral', ...Object.fromEntries(RESELLER_TOOLS.map(tool => [tool, false])) } };
  });
  return { accounts: next, changes, alreadyReferral };
}

function maskEmail(email) {
  const [local = '', domain = ''] = String(email ?? '').trim().split('@');
  return `${local.slice(0, 2)}***@${domain}`;
}

async function main() {
  const input = process.argv[2];
  if (!input || input.startsWith('--')) throw new Error('An explicit customer-accounts.json path is required');
  const accountsPath = path.resolve(input);
  const original = await readFile(accountsPath, 'utf8');
  const result = planReferralSellers(JSON.parse(original));
  const apply = process.argv.includes('--apply');
  console.log(JSON.stringify({ mode: apply ? 'apply' : 'preview', changes: result.changes, alreadyReferral: result.alreadyReferral }, null, 2));
  if (!result.changes.length && !result.alreadyReferral.length) {
    console.log('No referral marketer seller account found; nothing written');
    process.exitCode = 2;
    return;
  }
  if (!apply || !result.changes.length) return;
  if (await readFile(accountsPath, 'utf8') !== original) throw new Error('Accounts changed during preview; retry with the web writer stopped');
  const stamp = Date.now();
  const backup = `${accountsPath}.referral-backup-${stamp}`;
  const temporary = `${accountsPath}.referral-tmp-${stamp}`;
  await copyFile(accountsPath, backup);
  await chmod(backup, 0o600);
  await writeFile(temporary, JSON.stringify(result.accounts, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
  if (await readFile(accountsPath, 'utf8') !== original) throw new Error('Concurrent accounts write detected; original retained');
  await rename(temporary, accountsPath);
  console.log(`Switched ${result.changes.length} seller account(s) to referral mode. Backup: ${backup}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
