import "server-only";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { createNotification } from "./notification-repository";

export type DealerApplicationStatus = "pending" | "reviewing" | "approved" | "rejected";

export interface DealerApplicationHistoryEntry {
  id: string;
  at: string;
  actor: string;
  message: string;
  fromStatus?: DealerApplicationStatus;
  toStatus?: DealerApplicationStatus;
}

export interface DealerApplication {
  id: string;
  reference: string;
  createdAt: string;
  updatedAt: string;
  status: DealerApplicationStatus;
  // Firma
  companyTitle: string;
  taxOffice: string;
  taxNumber: string;
  tradeRegistryNumber?: string | undefined;
  mersisNumber?: string | undefined;
  companyType: string;
  // Yetkili & adres
  authorizedPerson: string;
  phone: string;
  whatsapp?: string | undefined;
  email: string;
  invoiceAddress: string;
  deliveryAddress: string;
  // Ticari profil
  city: string;
  district: string;
  activityArea: string;
  annualPurchaseVolume?: string | undefined;
  dealershipType?: string | undefined;
  referenceCompany?: string | undefined;
  // Onaylar
  kvkkAccepted: boolean;
  commercialConsent: boolean;
  // İnceleme
  reviewNote?: string | undefined;
  reviewedBy?: string | undefined;
  reviewedAt?: string | undefined;
  // Hesap açma (onay sonrası)
  accountId?: string | undefined;
  accountEmail?: string | undefined;
  provisionedAt?: string | undefined;
  welcomeMailSent?: boolean | undefined;
  history: DealerApplicationHistoryEntry[];
}

export interface DealerApplicationInput {
  companyTitle: string;
  taxOffice: string;
  taxNumber: string;
  tradeRegistryNumber?: string | undefined;
  mersisNumber?: string | undefined;
  companyType: string;
  authorizedPerson: string;
  phone: string;
  whatsapp?: string | undefined;
  email: string;
  invoiceAddress: string;
  deliveryAddress: string;
  city: string;
  district: string;
  activityArea: string;
  annualPurchaseVolume?: string | undefined;
  dealershipType?: string | undefined;
  referenceCompany?: string | undefined;
  kvkkAccepted: boolean;
  commercialConsent: boolean;
}

const rootDir = findWorkspaceRoot(process.cwd());
const dataDir = path.join(rootDir, "data");
const applicationsPath = path.join(dataDir, "dealer-applications.json");
let applicationMutationQueue: Promise<void> = Promise.resolve();

function enqueueApplicationMutation<T>(mutation: () => Promise<T>): Promise<T> {
  const operation = applicationMutationQueue.then(mutation, mutation);
  applicationMutationQueue = operation.then(() => undefined, () => undefined);
  return operation;
}

export async function listDealerApplications(filter: { status?: DealerApplicationStatus | "all"; q?: string } = {}): Promise<DealerApplication[]> {
  const rows = await loadApplications();
  const status = filter.status && filter.status !== "all" ? filter.status : undefined;
  const term = (filter.q ?? "").trim().toLocaleLowerCase("tr-TR");

  return rows
    .filter((row) => (status ? row.status === status : true))
    .filter((row) => {
      if (!term) {
        return true;
      }
      return [row.companyTitle, row.authorizedPerson, row.email, row.phone, row.taxNumber, row.reference, row.city]
        .filter(Boolean)
        .some((value) => value.toLocaleLowerCase("tr-TR").includes(term));
    })
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

export async function getDealerApplication(id: string): Promise<DealerApplication | null> {
  const rows = await loadApplications();
  return rows.find((row) => row.id === id) ?? null;
}

export async function countDealerApplicationsByStatus(): Promise<Record<DealerApplicationStatus, number> & { total: number }> {
  const rows = await loadApplications();
  const counts = { pending: 0, reviewing: 0, approved: 0, rejected: 0, total: rows.length };
  for (const row of rows) {
    counts[row.status] += 1;
  }
  return counts;
}

export function createDealerApplication(input: DealerApplicationInput): Promise<DealerApplication> {
  return enqueueApplicationMutation(() => createDealerApplicationUnlocked(input));
}

async function createDealerApplicationUnlocked(input: DealerApplicationInput): Promise<DealerApplication> {
  const rows = await loadApplications();
  const normalizedInput = normalizeApplicationInput(input);
  const duplicate = rows.find((row) =>
    (row.status === "pending" || row.status === "reviewing") &&
    (row.email.toLowerCase() === normalizedInput.email || row.taxNumber === normalizedInput.taxNumber)
  );
  if (duplicate) throw new Error(`Bu firma için açık bir başvuru zaten var: ${duplicate.reference}`);
  const now = new Date().toISOString();
  const reference = buildReference(now, rows.length + 1);

  const application: DealerApplication = {
    id: `dealer-${randomUUID()}`,
    reference,
    createdAt: now,
    updatedAt: now,
    status: "pending",
    ...normalizedInput,
    history: [
      {
        id: `hist-${randomUUID()}`,
        at: now,
        actor: normalizedInput.authorizedPerson,
        message: "Bayi başvurusu alındı.",
        toStatus: "pending"
      }
    ]
  };

  await saveApplications([application, ...rows]);
  await createNotification({
    recipientType: "admin",
    recipientKey: "all",
    level: "info",
    title: "Yeni bayi başvurusu",
    body: `${application.companyTitle} (${application.city}) — ${application.authorizedPerson}`,
    href: `/admin/dealers?highlight=${application.id}`
  });

  return application;
}

function normalizeApplicationInput(input: DealerApplicationInput): DealerApplicationInput {
  const required = (value: unknown, label: string, min: number, max: number): string => {
    const cleaned = typeof value === "string" ? value.trim() : "";
    if (cleaned.length < min || cleaned.length > max) throw new Error(`${label} uzunluğu geçersiz.`);
    return cleaned;
  };
  const optional = (value: unknown, label: string, max: number): string | undefined => {
    const cleaned = typeof value === "string" ? value.trim() : "";
    if (cleaned.length > max) throw new Error(`${label} çok uzun.`);
    return cleaned || undefined;
  };
  const taxNumber = required(input.taxNumber, "Vergi numarası", 10, 11);
  if (!/^\d{10,11}$/.test(taxNumber)) throw new Error("Vergi numarası 10 veya 11 haneli olmalıdır.");
  const email = required(input.email, "E-posta", 5, 254).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Geçerli bir e-posta adresi girin.");
  if (!input.kvkkAccepted) throw new Error("KVKK onayı zorunludur.");

  return {
    companyTitle: required(input.companyTitle, "Firma ünvanı", 2, 180),
    taxOffice: required(input.taxOffice, "Vergi dairesi", 2, 100),
    taxNumber,
    tradeRegistryNumber: optional(input.tradeRegistryNumber, "Ticaret sicil numarası", 80),
    mersisNumber: optional(input.mersisNumber, "MERSİS numarası", 32),
    companyType: required(input.companyType, "Firma tipi", 2, 80),
    authorizedPerson: required(input.authorizedPerson, "Yetkili kişi", 2, 120),
    phone: required(input.phone, "Telefon", 10, 32),
    whatsapp: optional(input.whatsapp, "WhatsApp", 32),
    email,
    invoiceAddress: required(input.invoiceAddress, "Fatura adresi", 10, 600),
    deliveryAddress: required(input.deliveryAddress, "Teslimat adresi", 10, 600),
    city: required(input.city, "İl", 2, 80),
    district: required(input.district, "İlçe", 2, 80),
    activityArea: required(input.activityArea, "Faaliyet alanı", 2, 160),
    annualPurchaseVolume: optional(input.annualPurchaseVolume, "Yıllık alım hacmi", 80),
    dealershipType: optional(input.dealershipType, "Bayilik türü", 80),
    referenceCompany: optional(input.referenceCompany, "Referans firma", 180),
    kvkkAccepted: true,
    commercialConsent: Boolean(input.commercialConsent)
  };
}

export async function updateDealerApplicationStatus(
  id: string,
  status: DealerApplicationStatus,
  actor: string,
  note?: string
): Promise<DealerApplication> {
  return enqueueApplicationMutation(() => updateDealerApplicationStatusUnlocked(id, status, actor, note));
}

async function updateDealerApplicationStatusUnlocked(
  id: string,
  status: DealerApplicationStatus,
  actor: string,
  note?: string
): Promise<DealerApplication> {
  const rows = await loadApplications();
  const index = rows.findIndex((row) => row.id === id);
  if (index < 0) {
    throw new Error("Başvuru bulunamadı.");
  }

  const current = rows[index]!;
  const now = new Date().toISOString();
  const statusLabel = STATUS_LABELS[status];
  const next: DealerApplication = {
    ...current,
    status,
    updatedAt: now,
    reviewNote: note?.trim() || current.reviewNote,
    reviewedBy: actor,
    reviewedAt: now,
    history: [
      {
        id: `hist-${randomUUID()}`,
        at: now,
        actor,
        message: note?.trim() ? `${statusLabel}: ${note.trim()}` : `Durum güncellendi: ${statusLabel}`,
        fromStatus: current.status,
        toStatus: status
      },
      ...current.history
    ].slice(0, 50)
  };

  rows[index] = next;
  await saveApplications(rows);
  return next;
}

export async function recordApplicationProvisioning(
  id: string,
  provisioning: { accountId: string; accountEmail: string; welcomeMailSent: boolean; note: string }
): Promise<DealerApplication> {
  return enqueueApplicationMutation(() => recordApplicationProvisioningUnlocked(id, provisioning));
}

async function recordApplicationProvisioningUnlocked(
  id: string,
  provisioning: { accountId: string; accountEmail: string; welcomeMailSent: boolean; note: string }
): Promise<DealerApplication> {
  const rows = await loadApplications();
  const index = rows.findIndex((row) => row.id === id);
  if (index < 0) {
    throw new Error("Başvuru bulunamadı.");
  }

  const current = rows[index]!;
  const now = new Date().toISOString();
  rows[index] = {
    ...current,
    accountId: provisioning.accountId,
    accountEmail: provisioning.accountEmail,
    provisionedAt: now,
    welcomeMailSent: provisioning.welcomeMailSent,
    updatedAt: now,
    history: [
      {
        id: `hist-${randomUUID()}`,
        at: now,
        actor: "system",
        message: provisioning.note
      },
      ...current.history
    ].slice(0, 50)
  };

  await saveApplications(rows);
  return rows[index]!;
}

const STATUS_LABELS: Record<DealerApplicationStatus, string> = {
  pending: "Beklemede",
  reviewing: "İnceleniyor",
  approved: "Onaylandı",
  rejected: "Reddedildi"
};

export function dealerApplicationStatusLabel(status: DealerApplicationStatus): string {
  return STATUS_LABELS[status];
}

function buildReference(iso: string, sequence: number): string {
  const date = iso.slice(0, 10).replace(/-/g, "");
  return `BSV-${date}-${String(sequence).padStart(4, "0")}`;
}

async function loadApplications(): Promise<DealerApplication[]> {
  try {
    const raw = await readFile(applicationsPath, "utf8");
    const parsed = JSON.parse(raw) as DealerApplication[];
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    const code = typeof error === "object" && error !== null && "code" in error ? String(error.code) : "";
    if (code === "ENOENT") {
      return [];
    }
    throw error;
  }
}

async function saveApplications(rows: DealerApplication[]): Promise<void> {
  await mkdir(dataDir, { recursive: true, mode: 0o700 });
  const tmpPath = `${applicationsPath}.${process.pid}.${randomUUID()}.tmp`;
  await writeFile(tmpPath, `${JSON.stringify(rows, null, 2)}\n`, { mode: 0o600 });
  await rename(tmpPath, applicationsPath);
}

function findWorkspaceRoot(startDir: string): string {
  let current = startDir;
  while (current !== path.dirname(current)) {
    if (existsSync(path.join(current, "pnpm-workspace.yaml")) || existsSync(path.join(current, "data", "catalog-store.json"))) {
      return current;
    }
    current = path.dirname(current);
  }
  return startDir;
}
