import "server-only";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { hashPassword, SCRYPT_PREFIX, verifyPassword } from "./password-hash";
import { createSessionToken, verifySessionToken } from "./session-token";

export { hashPassword, verifyPassword };

export type CustomerStatus = "approved" | "pending" | "suspended";
export type CustomerSegment = "standard" | "industrial" | "project";

export interface CustomerAccount {
  id: string;
  email: string;
  password: string;
  companyName: string;
  authorizedPerson: string;
  phone: string;
  city: string;
  deliveryAddress: string;
  status: CustomerStatus;
  segment: CustomerSegment;
  tierName?: string;
  tierRank?: string;
  accountManager?: string;
  supportLevel?: string;
  paymentTermDays?: number;
  creditLimit?: string;
  approvalLimit?: string;
  freeShippingThreshold?: string;
  priorityLevel?: number;
  perks?: string[];
  baseDiscountRate: number;
  brandDiscounts: Record<string, number>;
  categoryDiscounts: Record<string, number>;
  specialNetPrices: Record<string, string>;
}

export const CUSTOMER_COOKIE = "entas_customer_session";

const rootDir = findWorkspaceRoot(process.cwd());
const dataDir = path.join(rootDir, "data");
const customersPath = path.join(dataDir, "customer-accounts.json");

export async function getCustomers(): Promise<CustomerAccount[]> {
  await ensureCustomersFile();
  return readJson<CustomerAccount[]>(customersPath, []);
}

export async function authenticateCustomer(email: string, password: string): Promise<CustomerAccount | null> {
  const normalizedEmail = email.trim().toLocaleLowerCase("tr-TR");
  const customers = await getCustomers();
  const customer = customers.find((entry) => entry.email.toLocaleLowerCase("tr-TR") === normalizedEmail) ?? null;
  if (!customer || !verifyPassword(password, customer.password)) {
    return null;
  }

  if (!customer.password.startsWith(SCRYPT_PREFIX)) {
    await upgradeLegacyPassword(customer.id, password);
  }

  return customer;
}

export function createCustomerSessionToken(customerId: string, maxAgeSeconds = SESSION_MAX_AGE_SECONDS): string {
  return createSessionToken(customerId, sessionSecret(), maxAgeSeconds);
}

export async function getCurrentCustomer(): Promise<CustomerAccount | null> {
  const cookieStore = await cookies();
  const id = verifySessionToken(cookieStore.get(CUSTOMER_COOKIE)?.value ?? "", sessionSecret());
  if (!id) {
    return null;
  }

  const customers = await getCustomers();
  return customers.find((customer) => customer.id === id && customer.status === "approved") ?? null;
}

export async function requireCustomer(): Promise<CustomerAccount> {
  const customer = await getCurrentCustomer();
  if (!customer) {
    redirect("/login");
  }

  return customer;
}

const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 14;

function sessionSecret(): string {
  const secret = process.env.AUTH_SECRET?.trim();
  if (secret) {
    return secret;
  }
  if (process.env.NODE_ENV === "production") {
    throw new Error("AUTH_SECRET must be set in production.");
  }
  return "local-dev-auth-secret";
}

async function upgradeLegacyPassword(customerId: string, password: string): Promise<void> {
  const customers = await getCustomers();
  const index = customers.findIndex((customer) => customer.id === customerId);
  if (index < 0) {
    return;
  }

  customers[index] = { ...customers[index]!, password: hashPassword(password) };
  const tmpPath = `${customersPath}.${process.pid}.${randomUUID()}.tmp`;
  await writeFile(tmpPath, `${JSON.stringify(customers, null, 2)}\n`);
  await rename(tmpPath, customersPath);
}

async function ensureCustomersFile(): Promise<void> {
  if (existsSync(customersPath)) {
    return;
  }

  await mkdir(dataDir, { recursive: true });
  await writeFile(customersPath, "[]\n");
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
    if (isWorkspaceRoot(current)) {
      return current;
    }

    current = path.dirname(current);
  }

  return startDir;
}

function isWorkspaceRoot(dir: string): boolean {
  return existsSync(path.join(dir, "pnpm-workspace.yaml")) || existsSync(path.join(dir, "data", "customer-accounts.json"));
}
