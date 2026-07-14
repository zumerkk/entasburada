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

export async function createDealerApplication(input: DealerApplicationInput): Promise<DealerApplication> {
  const rows = await loadApplications();
  const now = new Date().toISOString();
  const reference = buildReference(now, rows.length + 1);

  const application: DealerApplication = {
    id: `dealer-${randomUUID()}`,
    reference,
    createdAt: now,
    updatedAt: now,
    status: "pending",
    ...input,
    history: [
      {
        id: `hist-${randomUUID()}`,
        at: now,
        actor: input.authorizedPerson || "Başvuran",
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

export async function updateDealerApplicationStatus(
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
  await mkdir(dataDir, { recursive: true });
  const tmpPath = `${applicationsPath}.tmp`;
  await writeFile(tmpPath, `${JSON.stringify(rows, null, 2)}\n`);
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
