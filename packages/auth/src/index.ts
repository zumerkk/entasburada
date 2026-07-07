export type Permission =
  | "catalog:read"
  | "price:read"
  | "cart:write"
  | "quote:write"
  | "order:write"
  | "company:approve-order"
  | "admin:dashboard"
  | "admin:dealers"
  | "admin:products"
  | "admin:pricing"
  | "admin:imports"
  | "admin:audit-log";

export type CompanyRole =
  | "company_owner"
  | "purchase_manager"
  | "purchase_staff"
  | "finance_officer"
  | "operations_officer"
  | "viewer"
  | "approver"
  | "warehouse_receiver";

export const companyRolePermissions: Record<CompanyRole, Permission[]> = {
  company_owner: ["catalog:read", "price:read", "cart:write", "quote:write", "order:write", "company:approve-order"],
  purchase_manager: ["catalog:read", "price:read", "cart:write", "quote:write", "order:write", "company:approve-order"],
  purchase_staff: ["catalog:read", "price:read", "cart:write", "quote:write"],
  finance_officer: ["catalog:read", "price:read", "quote:write"],
  operations_officer: ["catalog:read", "price:read", "cart:write"],
  viewer: ["catalog:read", "price:read"],
  approver: ["catalog:read", "price:read", "company:approve-order"],
  warehouse_receiver: ["catalog:read", "price:read"]
};

export function can(role: CompanyRole, permission: Permission): boolean {
  return companyRolePermissions[role].includes(permission);
}

export function shouldRequireOrderApproval(args: { totalNetAmount: number; approvalLimit?: number; role: CompanyRole }): boolean {
  if (args.role === "company_owner") {
    return false;
  }

  if (args.approvalLimit == null) {
    return true;
  }

  return args.totalNetAmount > args.approvalLimit;
}
