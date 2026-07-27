import "server-only";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import type { CustomerAccount } from "./customer-auth";
import {
  sortLedgerDescending,
  summarizeLedger,
  type BalanceSummary,
  type LedgerEntry,
  type LedgerEntryType,
  type LedgerRefType
} from "./customer-balance-policy";

export type { BalanceSummary, LedgerEntry } from "./customer-balance-policy";

const rootDir = findWorkspaceRoot(process.cwd());
const dataDir = path.join(rootDir, "data");
const ledgerPath = path.join(dataDir, "customer-ledger.json");

export interface AddLedgerEntryInput {
  customerId: string;
  type: LedgerEntryType;
  amount: string;
  description: string;
  date?: string | undefined;
  refType?: LedgerRefType | undefined;
  refId?: string | undefined;
  createdBy?: string | undefined;
}

export async function getLedgerEntries(customerId?: string): Promise<LedgerEntry[]> {
  await ensureLedgerFile();
  const all = await readJson<LedgerEntry[]>(ledgerPath, []);
  const scoped = customerId ? all.filter((entry) => entry.customerId === customerId) : all;
  return sortLedgerDescending(scoped);
}

export async function getCustomerBalance(customer: CustomerAccount): Promise<BalanceSummary> {
  const entries = await getLedgerEntries(customer.id);
  return summarizeLedger(entries, customer.creditLimit, "TRY");
}

export async function addLedgerEntry(input: AddLedgerEntryInput): Promise<LedgerEntry> {
  const amount = input.amount.trim();
  if (!amount) {
    throw new Error("Tutar zorunludur.");
  }
  if (input.type !== "debit" && input.type !== "credit") {
    throw new Error("İşlem türü borç veya alacak olmalıdır.");
  }
  const description = input.description.trim();
  if (!description) {
    throw new Error("Açıklama zorunludur.");
  }

  const now = new Date().toISOString();
  const entry: LedgerEntry = {
    id: `led-${randomUUID()}`,
    customerId: input.customerId,
    date: input.date?.trim() ? new Date(input.date).toISOString() : now,
    type: input.type,
    amount,
    description,
    refType: input.refType ?? "manual",
    createdAt: now,
    ...(input.refId ? { refId: input.refId } : {}),
    ...(input.createdBy ? { createdBy: input.createdBy } : {})
  };

  await ensureLedgerFile();
  const all = await readJson<LedgerEntry[]>(ledgerPath, []);
  await saveLedger([...all, entry]);
  return entry;
}

async function saveLedger(entries: LedgerEntry[]): Promise<void> {
  await mkdir(dataDir, { recursive: true });
  const tmpPath = `${ledgerPath}.${process.pid}.${randomUUID()}.tmp`;
  await writeFile(tmpPath, `${JSON.stringify(entries, null, 2)}\n`);
  await rename(tmpPath, ledgerPath);
}

async function ensureLedgerFile(): Promise<void> {
  if (existsSync(ledgerPath)) {
    return;
  }
  await mkdir(dataDir, { recursive: true });
  await writeFile(ledgerPath, "[]\n");
}

async function readJson<T>(filePath: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await readFile(filePath, "utf8")) as T;
  } catch (error) {
    const code = typeof error === "object" && error !== null && "code" in error ? String(error.code) : "";
    if (code === "ENOENT") {
      return fallback;
    }
    throw error;
  }
}

function findWorkspaceRoot(startDir: string): string {
  let current = startDir;
  while (current !== path.dirname(current)) {
    if (existsSync(path.join(current, "pnpm-workspace.yaml")) || existsSync(path.join(current, "data", "customer-accounts.json"))) {
      return current;
    }
    current = path.dirname(current);
  }
  return startDir;
}
