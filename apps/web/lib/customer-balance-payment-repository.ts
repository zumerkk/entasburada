import "server-only";
import { randomBytes, randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import type { CustomerAccount } from "./customer-auth";
import { addLedgerEntryIfMissing } from "./customer-balance-repository";
import {
  BALANCE_PAYMENT_SESSION_EXPIRY_HOURS,
  canCompleteBalancePayment,
  roundMoney
} from "./customer-balance-payment-policy";

export type BalancePaymentStatus = "creating" | "pending" | "paid" | "failed" | "expired";

export interface CustomerBalancePayment {
  id: string;
  customerId: string;
  customerEmail: string;
  companyName: string;
  providerCustomerId: string;
  amount: string;
  currency: "TRY";
  status: BalancePaymentStatus;
  merchantPaymentId?: string;
  providerSessionToken?: string;
  paymentPageUrl?: string;
  actualChargedAmount?: string;
  installmentCount?: string;
  failureReason?: string;
  createdAt: string;
  updatedAt: string;
  paidAt?: string;
  expiresAt: string;
}

const rootDir = findWorkspaceRoot(process.cwd());
const dataDir = path.join(rootDir, "data");
const paymentsPath = path.join(dataDir, "customer-balance-payments.json");
let paymentMutationQueue: Promise<void> = Promise.resolve();

export function createBalancePaymentIntent(
  customer: Pick<CustomerAccount, "id" | "email" | "companyName">,
  amount: number
): Promise<CustomerBalancePayment> {
  return enqueuePaymentMutation(async () => {
    const payments = expirePayments(await readPayments());
    const now = new Date().toISOString();
    const intent: CustomerBalancePayment = {
      id: `CBP${randomBytes(16).toString("hex").toUpperCase()}`,
      customerId: customer.id,
      customerEmail: customer.email,
      companyName: customer.companyName,
      providerCustomerId: customer.id,
      amount: roundMoney(amount).toFixed(2),
      currency: "TRY",
      status: "creating",
      createdAt: now,
      updatedAt: now,
      expiresAt: new Date(Date.now() + 2 * 60 * 1000).toISOString()
    };
    await savePayments(retainPayments([...payments, intent]));
    return intent;
  });
}

export function activateBalancePaymentIntent(
  id: string,
  provider: { merchantPaymentId: string; sessionToken: string; paymentPageUrl: string; expiresAt: string }
): Promise<CustomerBalancePayment> {
  return updateBalancePayment(id, (current) => {
    if (current.status !== "creating") return current;
    return {
      ...current,
      status: "pending",
      merchantPaymentId: provider.merchantPaymentId,
      providerSessionToken: provider.sessionToken,
      paymentPageUrl: provider.paymentPageUrl,
      expiresAt: provider.expiresAt,
      updatedAt: new Date().toISOString()
    };
  });
}

export function failBalancePaymentIntent(id: string, reason: string): Promise<CustomerBalancePayment | null> {
  return updateBalancePaymentOrNull(id, (current) => {
    if (current.status === "paid") return current;
    return {
      ...current,
      status: "failed",
      failureReason: boundedText(reason, 240),
      updatedAt: new Date().toISOString()
    };
  });
}

export function completeBalancePaymentIntent(
  id: string,
  result: { actualChargedAmount?: string; installmentCount?: string }
): Promise<CustomerBalancePayment> {
  return enqueuePaymentMutation(async () => {
    const payments = expirePayments(await readPayments());
    const index = payments.findIndex((payment) => payment.id === id);
    if (index < 0) throw new Error("Cari ödeme kaydı bulunamadı.");
    const current = payments[index]!;
    if (current.status === "paid") return current;
    if (!canCompleteBalancePayment(current.status)) throw new Error("Cari ödeme kaydı tamamlanmaya uygun değil.");

    await addLedgerEntryIfMissing({
      customerId: current.customerId,
      type: "credit",
      amount: current.amount,
      description: "Kartla cari hesap ödemesi",
      refType: "payment",
      refId: current.id,
      createdBy: "ZiraatPay"
    });

    const now = new Date().toISOString();
    const completed: CustomerBalancePayment = {
      ...current,
      status: "paid",
      updatedAt: now,
      paidAt: now,
      ...(result.actualChargedAmount ? { actualChargedAmount: boundedText(result.actualChargedAmount, 40) } : {}),
      ...(result.installmentCount ? { installmentCount: boundedText(result.installmentCount, 10) } : {})
    };
    payments[index] = completed;
    await savePayments(payments);
    return completed;
  });
}

export async function getBalancePaymentIntent(id: string): Promise<CustomerBalancePayment | null> {
  const payments = await readPayments();
  const payment = payments.find((item) => item.id === id);
  return payment ? effectivePayment(payment) : null;
}

export async function listCustomerBalancePayments(customerId: string, limit = 8): Promise<CustomerBalancePayment[]> {
  const payments = await readPayments();
  return payments
    .filter((payment) => payment.customerId === customerId)
    .map(effectivePayment)
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
    .slice(0, Math.max(1, Math.min(50, Math.trunc(limit))));
}

function updateBalancePayment(
  id: string,
  updater: (current: CustomerBalancePayment) => CustomerBalancePayment
): Promise<CustomerBalancePayment> {
  return enqueuePaymentMutation(async () => {
    const payments = expirePayments(await readPayments());
    const index = payments.findIndex((payment) => payment.id === id);
    if (index < 0) throw new Error("Cari ödeme kaydı bulunamadı.");
    const updated = updater(payments[index]!);
    payments[index] = updated;
    await savePayments(payments);
    return updated;
  });
}

function updateBalancePaymentOrNull(
  id: string,
  updater: (current: CustomerBalancePayment) => CustomerBalancePayment
): Promise<CustomerBalancePayment | null> {
  return enqueuePaymentMutation(async () => {
    const payments = expirePayments(await readPayments());
    const index = payments.findIndex((payment) => payment.id === id);
    if (index < 0) return null;
    const updated = updater(payments[index]!);
    payments[index] = updated;
    await savePayments(payments);
    return updated;
  });
}

function enqueuePaymentMutation<T>(mutation: () => Promise<T>): Promise<T> {
  const operation = paymentMutationQueue.then(mutation, mutation);
  paymentMutationQueue = operation.then(() => undefined, () => undefined);
  return operation;
}

async function readPayments(): Promise<CustomerBalancePayment[]> {
  await ensurePaymentsFile();
  return readJson<CustomerBalancePayment[]>(paymentsPath, []);
}

async function savePayments(payments: CustomerBalancePayment[]): Promise<void> {
  await mkdir(dataDir, { recursive: true, mode: 0o700 });
  const tmpPath = `${paymentsPath}.${process.pid}.${randomUUID()}.tmp`;
  await writeFile(tmpPath, `${JSON.stringify(payments, null, 2)}\n`, { mode: 0o600 });
  await rename(tmpPath, paymentsPath);
}

async function ensurePaymentsFile(): Promise<void> {
  if (existsSync(paymentsPath)) return;
  await mkdir(dataDir, { recursive: true, mode: 0o700 });
  await writeFile(paymentsPath, "[]\n", { mode: 0o600 });
}

function retainPayments(payments: CustomerBalancePayment[]): CustomerBalancePayment[] {
  const active = payments.filter((payment) => payment.status === "creating" || payment.status === "pending");
  const terminal = payments
    .filter((payment) => payment.status === "paid" || payment.status === "failed" || payment.status === "expired")
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
    .slice(0, 5_000);
  return [...active, ...terminal];
}

function expirePayments(payments: CustomerBalancePayment[]): CustomerBalancePayment[] {
  return payments.map(effectivePayment);
}

function effectivePayment(payment: CustomerBalancePayment): CustomerBalancePayment {
  if (payment.status !== "creating" && payment.status !== "pending") return payment;
  const fallbackExpiry = new Date(
    new Date(payment.createdAt).getTime() + BALANCE_PAYMENT_SESSION_EXPIRY_HOURS * 60 * 60 * 1000
  ).getTime();
  const expiry = Date.parse(payment.expiresAt ?? "") || fallbackExpiry;
  if (expiry > Date.now()) return payment;
  return {
    ...payment,
    status: "expired",
    failureReason: "Ödeme oturumunun süresi doldu.",
    updatedAt: new Date().toISOString()
  };
}

async function readJson<T>(filePath: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await readFile(filePath, "utf8")) as T;
  } catch (error) {
    const code = typeof error === "object" && error !== null && "code" in error ? String(error.code) : "";
    if (code === "ENOENT") return fallback;
    throw error;
  }
}

function boundedText(value: string, maxLength: number): string {
  return value.trim().replace(/[\u0000-\u001f\u007f]/g, " ").slice(0, maxLength);
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
