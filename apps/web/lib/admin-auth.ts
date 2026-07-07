import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

export const ADMIN_COOKIE = "entas_admin_session";
export const ADMIN_SESSION_VALUE = process.env.ADMIN_SESSION_SECRET ?? "dev-admin-session";

export function getAdminEmail(): string {
  return process.env.ADMIN_EMAIL ?? "admin@entasburada.local";
}

export function getAdminPassword(): string {
  if (process.env.NODE_ENV === "production" && !process.env.ADMIN_PASSWORD) {
    throw new Error("ADMIN_PASSWORD must be set in production.");
  }

  return process.env.ADMIN_PASSWORD ?? "change-me-local-dev-only";
}

export async function isAdminAuthenticated(): Promise<boolean> {
  const cookieStore = await cookies();
  return cookieStore.get(ADMIN_COOKIE)?.value === ADMIN_SESSION_VALUE;
}

export async function requireAdmin(): Promise<void> {
  if (!(await isAdminAuthenticated())) {
    redirect("/admin/login");
  }
}
