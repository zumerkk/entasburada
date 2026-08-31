import "server-only";
import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { hashPassword, verifyPassword } from "./password-hash";
import { createSessionToken, verifySessionToken } from "./session-token";
import { validatePasswordStrength } from "./security";
import { FREE_SHIPPING_THRESHOLD_TRY } from "./commercial-policy";
import { clearApplicationTemporaryPasswordForAccount } from "./dealer-application-repository";

export { hashPassword, verifyPassword };

export type CustomerStatus = "approved" | "pending" | "suspended";
export type CustomerSegment = "standard" | "industrial" | "project";
export type CompanyUserRole = "COMPANY_OWNER" | "PURCHASE_MANAGER" | "PURCHASE_STAFF" | "FINANCE_OFFICER" | "APPROVER" | "WAREHOUSE_RECEIVER" | "VIEWER";
export type SellerMode = "reseller" | "dropshipping" | "hybrid";

export interface SellerAccess {
  enabled: boolean;
  mode: SellerMode;
  productFeedEnabled: boolean;
  apiEnabled: boolean;
  exactStockEnabled: boolean;
  orderApiEnabled: boolean;
  blindShippingEnabled: boolean;
  defaultMarkupRate: number;
  apiKeyHash?: string;
  apiKeyPrefix?: string;
  apiKeyCreatedAt?: string;
}

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
  companyId?: string;
  companyRole?: CompanyUserRole;
  orderApprovalRequired?: boolean;
  invitedById?: string;
  freeShippingThreshold?: string;
  priorityLevel?: number;
  perks?: string[];
  baseDiscountRate: number;
  brandDiscounts: Record<string, number>;
  categoryDiscounts: Record<string, number>;
  specialNetPrices: Record<string, string>;
  mustChangePassword?: boolean;
  sellerAccess?: SellerAccess;
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
  // A valid session must stay distinguishable from an anonymous request while the
  // user is completing the mandatory first-login password change. Otherwise every
  // protected workspace route incorrectly sends the user back to /login.
  const customer = await getCurrentCustomer({ allowPasswordChangeRequired: true });
  if (!customer) {
    redirect("/login");
  }

  if (!options.allowPasswordChangeRequired && customer.mustChangePassword) {
    redirect("/account?passwordChangeRequired=1#security");
  }

  return customer;
}

export async function findCustomerByEmail(email: string): Promise<CustomerAccount | null> {
  const normalizedEmail = normalizeEmail(email);
  const customers = await getCustomers();
  return customers.find((entry) => normalizeEmail(entry.email) === normalizedEmail) ?? null;
}

export async function getCompanyMembers(customer: CustomerAccount): Promise<CustomerAccount[]> {
  const companyId = customer.companyId ?? customer.id;
  return (await getCustomers()).filter((member) => (member.companyId ?? member.id) === companyId);
}

export function canApproveCompanyOrders(customer: CustomerAccount): boolean {
  return ["COMPANY_OWNER", "PURCHASE_MANAGER", "APPROVER", "FINANCE_OFFICER"].includes(customer.companyRole ?? "COMPANY_OWNER");
}

export function inviteCompanyMember(
  inviter: CustomerAccount,
  input: { email: string; authorizedPerson: string; phone?: string; companyRole: CompanyUserRole; approvalLimit?: string; orderApprovalRequired?: boolean }
): Promise<{ account: CustomerAccount; temporaryPassword: string }> {
  return enqueueCustomerMutation(() => inviteCompanyMemberUnlocked(inviter, input));
}

async function inviteCompanyMemberUnlocked(
  inviter: CustomerAccount,
  input: { email: string; authorizedPerson: string; phone?: string; companyRole: CompanyUserRole; approvalLimit?: string; orderApprovalRequired?: boolean }
): Promise<{ account: CustomerAccount; temporaryPassword: string }> {
  if (!canApproveCompanyOrders(inviter)) throw new Error("Firma kullanıcısı ekleme yetkiniz yok.");
  const email = normalizeEmail(input.email);
  const authorizedPerson = input.authorizedPerson.trim().slice(0, 120);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Geçerli bir e-posta girin.");
  if (authorizedPerson.length < 2) throw new Error("Kullanıcı adı zorunludur.");
  const customers = await getCustomers();
  if (customers.some((customer) => normalizeEmail(customer.email) === email)) throw new Error("Bu e-posta adresiyle kayıtlı kullanıcı zaten var.");
  const temporaryPassword = generateCompanyTempPassword();
  const account = enforceUniformCommercialTerms({
    ...inviter,
    id: `cust-${randomUUID()}`,
    email,
    password: hashPassword(temporaryPassword),
    authorizedPerson,
    phone: input.phone?.trim().slice(0, 32) || inviter.phone,
    companyId: inviter.companyId ?? inviter.id,
    companyRole: input.companyRole,
    approvalLimit: normalizeMoneyLimit(input.approvalLimit),
    orderApprovalRequired: Boolean(input.orderApprovalRequired),
    invitedById: inviter.id,
    mustChangePassword: true
  });
  await saveCustomers([...customers, account]);
  return { account, temporaryPassword };
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

export function changeCustomerPassword(customerId: string, currentPassword: string, newPassword: string): Promise<CustomerAccount> {
  return enqueueCustomerMutation(() => changeCustomerPasswordUnlocked(customerId, currentPassword, newPassword));
}

export function updateSellerAccess(customerId: string, patch: Partial<SellerAccess>): Promise<CustomerAccount> {
  return enqueueCustomerMutation(async () => {
    const customers = await getCustomers();
    const index = customers.findIndex((customer) => customer.id === customerId);
    if (index < 0) throw new Error("Hesap bulunamadı.");
    const current = customers[index]!;
    const sellerAccess = normalizeSellerAccess({ ...current.sellerAccess, ...patch });
    const updated = enforceUniformCommercialTerms({ ...current, sellerAccess });
    customers[index] = updated;
    await saveCustomers(customers);
    return updated;
  });
}

/** Yeni anahtar yalnızca bu çağrının sonucunda düz metin olarak döner; diskte özeti saklanır. */
export function rotateSellerApiKey(customerId: string): Promise<{ account: CustomerAccount; apiKey: string }> {
  return enqueueCustomerMutation(async () => {
    const customers = await getCustomers();
    const index = customers.findIndex((customer) => customer.id === customerId);
    if (index < 0) throw new Error("Hesap bulunamadı.");
    const current = customers[index]!;
    if (!current.sellerAccess?.enabled || !current.sellerAccess.apiEnabled) {
      throw new Error("Önce satıcı ve API erişimini etkinleştirin.");
    }
    const apiKey = `entas_live_${randomBytes(32).toString("base64url")}`;
    const sellerAccess = normalizeSellerAccess({
      ...current.sellerAccess,
      apiKeyHash: hashSellerApiKey(apiKey),
      apiKeyPrefix: apiKey.slice(0, 18),
      apiKeyCreatedAt: new Date().toISOString()
    });
    const account = enforceUniformCommercialTerms({ ...current, sellerAccess });
    customers[index] = account;
    await saveCustomers(customers);
    return { account, apiKey };
  });
}

export function resetCustomerPasswordByAdmin(customerId: string): Promise<{ account: CustomerAccount; temporaryPassword: string }> {
  return enqueueCustomerMutation(async () => {
    const customers = await getCustomers();
    const index = customers.findIndex((customer) => customer.id === customerId);
    if (index < 0) throw new Error("Hesap bulunamadı.");
    const temporaryPassword = generateCompanyTempPassword();
    const account = enforceUniformCommercialTerms({
      ...customers[index]!,
      password: hashPassword(temporaryPassword),
      mustChangePassword: true
    });
    customers[index] = account;
    await saveCustomers(customers);
    return { account, temporaryPassword };
  });
}

export async function authenticateSellerApiKey(apiKey: string): Promise<CustomerAccount | null> {
  const token = apiKey.trim();
  if (!/^entas_live_[A-Za-z0-9_-]{40,}$/.test(token)) return null;
  const tokenHash = Buffer.from(hashSellerApiKey(token), "hex");
  const customers = await getCustomers();
  for (const customer of customers) {
    const storedHash = customer.sellerAccess?.apiKeyHash;
    if (!storedHash || storedHash.length !== tokenHash.length * 2) continue;
    const stored = Buffer.from(storedHash, "hex");
    if (stored.length === tokenHash.length && timingSafeEqual(stored, tokenHash)) {
      return customer.status === "approved" && customer.sellerAccess?.enabled && customer.sellerAccess.apiEnabled ? customer : null;
    }
  }
  return null;
}

async function changeCustomerPasswordUnlocked(customerId: string, currentPassword: string, newPassword: string): Promise<CustomerAccount> {
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
  await clearApplicationTemporaryPasswordForAccount(customerId).catch((error: unknown) => {
    console.warn(`[dealer-credential] Gecici sifre kaydi temizlenemedi: ${error instanceof Error ? error.message : error}`);
  });
  return enforceUniformCommercialTerms(customers[index]!);
}

async function saveCustomers(customers: CustomerAccount[]): Promise<void> {
  const tmpPath = `${customersPath}.${process.pid}.${randomUUID()}.tmp`;
  await writeFile(tmpPath, `${JSON.stringify(customers.map(enforceUniformCommercialTerms), null, 2)}\n`, { mode: 0o600 });
  await rename(tmpPath, customersPath);
}

function enforceUniformCommercialTerms(customer: CustomerAccount): CustomerAccount {
  return {
    ...customer,
    companyId: customer.companyId ?? customer.id,
    companyRole: customer.companyRole ?? "COMPANY_OWNER",
    orderApprovalRequired: Boolean(customer.orderApprovalRequired),
    baseDiscountRate: 0,
    brandDiscounts: {},
    categoryDiscounts: {},
    specialNetPrices: {},
    freeShippingThreshold: String(FREE_SHIPPING_THRESHOLD_TRY),
    sellerAccess: normalizeSellerAccess(customer.sellerAccess)
  };
}

export function normalizeSellerAccess(access?: Partial<SellerAccess>): SellerAccess {
  const markup = Number(access?.defaultMarkupRate);
  return {
    enabled: Boolean(access?.enabled),
    mode: access?.mode === "dropshipping" || access?.mode === "hybrid" ? access.mode : "reseller",
    productFeedEnabled: Boolean(access?.productFeedEnabled),
    apiEnabled: Boolean(access?.apiEnabled),
    exactStockEnabled: Boolean(access?.exactStockEnabled),
    orderApiEnabled: Boolean(access?.orderApiEnabled),
    blindShippingEnabled: Boolean(access?.blindShippingEnabled),
    defaultMarkupRate: Number.isFinite(markup) ? Math.min(500, Math.max(0, markup)) : 30,
    ...(access?.apiKeyHash ? { apiKeyHash: access.apiKeyHash } : {}),
    ...(access?.apiKeyPrefix ? { apiKeyPrefix: access.apiKeyPrefix } : {}),
    ...(access?.apiKeyCreatedAt ? { apiKeyCreatedAt: access.apiKeyCreatedAt } : {})
  };
}

function hashSellerApiKey(apiKey: string): string {
  return createHash("sha256").update(apiKey).digest("hex");
}

function generateCompanyTempPassword(): string {
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  const bytes = randomBytes(8);
  const token = Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("");
  return `Entas-${token.slice(0, 4)}-${token.slice(4)}9!`;
}

function normalizeMoneyLimit(value: string | undefined): string {
  const parsed = Number(String(value ?? "0").replace(",", "."));
  return Number.isFinite(parsed) && parsed >= 0 ? parsed.toFixed(2) : "0.00";
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
