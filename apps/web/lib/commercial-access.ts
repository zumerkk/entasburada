import type { CustomerAccount } from "./customer-auth";

export interface CommercialAccessRecord {
  email: string;
  trackingCode: string;
}

export function isSecureTrackingCapability(code: string): boolean {
  return /^[TS][A-F0-9]{32}$/.test(code.trim().toUpperCase());
}

export function canAccessCommercialRecord(
  record: CommercialAccessRecord,
  customer: Pick<CustomerAccount, "email"> | null
): boolean {
  if (customer && normalizeEmail(record.email) === normalizeEmail(customer.email)) return true;
  return isSecureTrackingCapability(record.trackingCode);
}

export function isCommercialRecordOwner(
  record: Pick<CommercialAccessRecord, "email">,
  customer: Pick<CustomerAccount, "email"> | null
): boolean {
  return Boolean(customer && normalizeEmail(record.email) === normalizeEmail(customer.email));
}

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}
