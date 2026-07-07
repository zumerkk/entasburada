import "server-only";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

export type NotificationRecipientType = "admin" | "customer";
export type NotificationLevel = "info" | "success" | "warning" | "danger";

export interface NotificationRecord {
  id: string;
  createdAt: string;
  recipientType: NotificationRecipientType;
  recipientKey: string;
  level: NotificationLevel;
  title: string;
  body: string;
  href?: string;
  read: boolean;
}

export interface CreateNotificationInput {
  recipientType: NotificationRecipientType;
  recipientKey: string;
  level?: NotificationLevel;
  title: string;
  body: string;
  href?: string;
}

const rootDir = findWorkspaceRoot(process.cwd());
const dataDir = path.join(rootDir, "data");
const notificationsPath = path.join(dataDir, "notifications.json");

export async function createNotification(input: CreateNotificationInput): Promise<NotificationRecord> {
  const rows = await loadNotifications();
  const notification: NotificationRecord = stripUndefined({
    id: `notification-${randomUUID()}`,
    createdAt: new Date().toISOString(),
    recipientType: input.recipientType,
    recipientKey: input.recipientKey,
    level: input.level ?? "info",
    title: input.title,
    body: input.body,
    href: input.href,
    read: false
  }) as NotificationRecord;

  await saveNotifications([notification, ...rows].slice(0, 500));
  return notification;
}

export async function listAdminNotifications(limit = 20): Promise<NotificationRecord[]> {
  const rows = await loadNotifications();
  return rows.filter((row) => row.recipientType === "admin").slice(0, limit);
}

export async function listCustomerNotifications(recipientKey: string, limit = 20): Promise<NotificationRecord[]> {
  const rows = await loadNotifications();
  return rows.filter((row) => row.recipientType === "customer" && row.recipientKey === recipientKey).slice(0, limit);
}

export async function unreadAdminNotificationCount(): Promise<number> {
  const rows = await loadNotifications();
  return rows.filter((row) => row.recipientType === "admin" && !row.read).length;
}

async function loadNotifications(): Promise<NotificationRecord[]> {
  await ensureFile();
  return readJson<NotificationRecord[]>(notificationsPath, []);
}

async function saveNotifications(rows: NotificationRecord[]): Promise<void> {
  await mkdir(dataDir, { recursive: true });
  const tmpPath = `${notificationsPath}.${process.pid}.${randomUUID()}.tmp`;
  await writeFile(tmpPath, `${JSON.stringify(rows, null, 2)}\n`);
  await rename(tmpPath, notificationsPath);
}

async function ensureFile(): Promise<void> {
  if (existsSync(notificationsPath)) {
    return;
  }

  await mkdir(dataDir, { recursive: true });
  await writeFile(notificationsPath, "[]\n");
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

function stripUndefined<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map(stripUndefined) as T;
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).filter(([, entry]) => entry !== undefined)) as T;
  }

  return value;
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
  return (
    existsSync(path.join(dir, "pnpm-workspace.yaml")) ||
    existsSync(path.join(dir, "data", "notifications.json")) ||
    existsSync(path.join(dir, "data", "catalog-store.json"))
  );
}
