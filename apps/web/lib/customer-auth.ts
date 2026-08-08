import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { hashPassword, verifyPassword } from "./password-hash";
import { createSessionToken, verifySessionToken } from "./session-token";
import { validatePasswordStrength } from "./security";
import { FREE_SHIPPING_THRESHOLD_TRY } from "./commercial-policy";

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
  mustChangePassword?: boolean;
}

export const CUSTOMER_COOKIE = process.env.NODE_ENV === "production" ? "__Host-entas_customer_session" : "entas_customer_session";
const DUMMY_PASSWORD_HASH = `scrypt$${Buffer.alloc(16, 1).toString("base64url")}$${Buffer.alloc(64, 2).toString("base64url")}`;

const rootDir = findWorkspaceRoot(process.cwd());
const dataDir = path.join(rootDir, "data");
const customersPath = path.join(dataDir, "customer-accounts.json");
let customerMutationQueue: Promise<void> = Promise.resolve();

function enqueueCustomerMutation<T>(mutation: () => Promise<T>): Promise<T> {
  const operation = customerMutationQueue.then(mutation, mutation);
  customerMutationQueue = operation.then(() => undefined, () => undefined);
  return operation;
}

export async function getCustomers(): Promise<CustomerAccount[]> {
  await ensureCustomersFile();
  const customers = await readJson<CustomerAccount[]>(customersPath, []);
  return customers.map(enforceUniformCommercialTerms);
}

export async function authenticateCustomer(email: string, password: string): Promise<CustomerAccount | null> {
  const normalizedEmail = normalizeEmail(email);
  const customers = await getCustomers();
  const customer = customers.find((entry) => normalizeEmail(entry.email) === normalizedEmail) ?? null;
  const passwordMatches = verifyPassword(password, customer?.password ?? DUMMY_PASSWORD_HASH);
  if (!customer || !passwordMatches) {
    return null;
  }

  return customer;
}

export function createCustomerSessionToken(customer: Pick<CustomerAccount, "id" | "password">, maxAgeSeconds = SESSION_MAX_AGE_SECONDS): string {
  return createSessionToken(customerSessionSubject(customer), sessionSecret(), maxAgeSeconds);
}

export async function getCurrentCustomer(options: { allowPasswordChangeRequired?: boolean } = {}): Promise<CustomerAccount | null> {
  const cookieStore = await cookies();
  const subject = verifySessionToken(cookieStore.get(CUSTOMER_COOKIE)?.value ?? "", sessionSecret());
  if (!subject) {
    return null;
  }

  const customers = await getCustomers();
  return customers.find((customer) =>
    customer.status === "approved" &&
    customerSessionSubject(customer) === subject &&
    (options.allowPasswordChangeRequired || !customer.mustChangePassword)
  ) ?? null;
}

export async function requireCustomer(options: { allowPasswordChangeRequired?: boolean } = {}): Promise<CustomerAccount> {
  const customer = await getCurrentCustomer(options);
  if (!customer) {
    redirect("/login");
  }

  return customer;
}

export async function findCustomerByEmail(email: string): Promise<CustomerAccount | null> {
  const normalizedEmail = normalizeEmail(email);
  const customers = await getCustomers();
  return customers.find((entry) => normalizeEmail(entry.email) === normalizedEmail) ?? null;
}

export function createCustomerAccount(account: Omit<CustomerAccount, "password"> & { plainPassword: string }): Promise<CustomerAccount> {
  return enqueueCustomerMutation(() => createCustomerAccountUnlocked(account));
}

async function createCustomerAccountUnlocked(account: Omit<CustomerAccount, "password"> & { plainPassword: string }): Promise<CustomerAccount> {
  const { plainPassword, ...rest } = account;
  const existing = await findCustomerByEmail(rest.email);
  if (existing) {
    throw new Error(`${rest.email} adresiyle kayıtlı bir bayi hesabı zaten var.`);
  }

  const passwordError = validatePasswordStrength(plainPassword);
  if (passwordError) throw new Error(passwordError);
  const record = enforceUniformCommercialTerms({ ...rest, email: normalizeEmail(rest.email), password: hashPassword(plainPassword) });
  const customers = await getCustomers();
  await saveCustomers([...customers, record]);
  return record;
}

/** Mevcut bir hesabın alanlarını günceller; id ve şifre korunur. */
export async function updateCustomerAccount(
  customerId: string,
  patch: Partial<Omit<CustomerAccount, "id" | "password">>
): Promise<CustomerAccount> {
  return enqueueCustomerMutation(() => updateCustomerAccountUnlocked(customerId, patch));
}

async function updateCustomerAccountUnlocked(
  customerId: string,
  patch: Partial<Omit<CustomerAccount, "id" | "password">>
): Promise<CustomerAccount> {
  const customers = await getCustomers();
  const index = customers.findIndex((customer) => customer.id === customerId);
  if (index < 0) {
    throw new Error("Hesap bulunamadı.");
  }
  const current = customers[index]!;
  const updated = enforceUniformCommercialTerms({ ...current, ...patch, id: current.id, password: current.password });
  customers[index] = updated;
  await saveCustomers(customers);
  return updated;
}

export function changeCustomerPassword(customerId: string, currentPassword: string, newPassword: string): Promise<void> {
  return enqueueCustomerMutation(() => changeCustomerPasswordUnlocked(customerId, currentPassword, newPassword));
}

async function changeCustomerPasswordUnlocked(customerId: string, currentPassword: string, newPassword: string): Promise<void> {
  const customers = await getCustomers();
  const index = customers.findIndex((customer) => customer.id === customerId);
  if (index < 0) {
    throw new Error("Hesap bulunamadı.");
  }

  if (!verifyPassword(currentPassword, customers[index]!.password)) {
    throw new Error("Mevcut şifre hatalı.");
  }

  const passwordError = validatePasswordStrength(newPassword);
  if (passwordError) throw new Error(passwordError);

  customers[index] = { ...customers[index]!, password: hashPassword(newPassword), mustChangePassword: false };
  await saveCustomers(customers);
}

async function saveCustomers(customers: CustomerAccount[]): Promise<void> {
  const tmpPath = `${customersPath}.${process.pid}.${randomUUID()}.tmp`;
  await writeFile(tmpPath, `${JSON.stringify(customers.map(enforceUniformCommercialTerms), null, 2)}\n`, { mode: 0o600 });
  await rename(tmpPath, customersPath);
}

function enforceUniformCommercialTerms(customer: CustomerAccount): CustomerAccount {
  return {
    ...customer,
    baseDiscountRate: 0,
    brandDiscounts: {},
    categoryDiscounts: {},
    specialNetPrices: {},
    freeShippingThreshold: String(FREE_SHIPPING_THRESHOLD_TRY)
  };
}

export const CUSTOMER_SESSION_MAX_AGE_SECONDS = 60 * 60 * 8;
const SESSION_MAX_AGE_SECONDS = CUSTOMER_SESSION_MAX_AGE_SECONDS;

function sessionSecret(): string {
  const secret = process.env.AUTH_SECRET?.trim();
  if (secret && (process.env.NODE_ENV !== "production" || secret.length >= 32)) {
    return secret;
  }
  if (process.env.NODE_ENV === "production") {
    throw new Error("AUTH_SECRET must be set in production.");
  }
  return "local-development-customer-auth-secret-only";
}

function customerSessionSubject(customer: Pick<CustomerAccount, "id" | "password">): string {
  const credentialVersion = createHash("sha256").update(customer.password).digest("base64url").slice(0, 22);
  return JSON.stringify({ id: customer.id, credentialVersion });
}

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

async function ensureCustomersFile(): Promise<void> {
  if (existsSync(customersPath)) {
    return;
  }

  await mkdir(dataDir, { recursive: true, mode: 0o700 });
  await writeFile(customersPath, "[]\n", { mode: 0o600 });
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
