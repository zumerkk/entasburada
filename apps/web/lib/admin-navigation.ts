export function resolveAdminHashPath(hash: string): string | null {
  const normalized = hash.replace(/^#/, "").trim().toLowerCase();

  if (normalized === "quotes") {
    return "/admin/quotes";
  }

  if (normalized === "orders") {
    return "/admin/orders";
  }

  return null;
}
