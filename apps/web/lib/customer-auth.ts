import "server-only";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

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
  return customers.find((customer) => customer.email.toLocaleLowerCase("tr-TR") === normalizedEmail && customer.password === password) ?? null;
}

export async function getCurrentCustomer(): Promise<CustomerAccount | null> {
  const cookieStore = await cookies();
  const id = cookieStore.get(CUSTOMER_COOKIE)?.value;
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
    if (existsSync(path.join(current, "pnpm-workspace.yaml"))) {
      return current;
    }

    current = path.dirname(current);
  }

  return startDir;
}
