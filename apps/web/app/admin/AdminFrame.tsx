import {
  Boxes,
  Bell,
  ClipboardList,
  FileSpreadsheet,
  LayoutDashboard,
  LockKeyhole,
  PackageSearch,
  ReceiptText,
  ShieldCheck,
  Tags,
  UsersRound
} from "lucide-react";
import { logoutAction } from "./login/actions";

const menu = [
  { label: "Dashboard", href: "/admin", icon: LayoutDashboard },
  { label: "Ürünler", href: "/admin/products", icon: PackageSearch },
  { label: "Import merkezi", href: "/admin/import", icon: FileSpreadsheet },
  { label: "XML İzleme", href: "/admin/integrations", icon: Boxes },
  { label: "Bildirimler", href: "/admin/notifications", icon: Bell },
  { label: "Bayiler", href: "/admin#dealers", icon: UsersRound },
  { label: "Fiyat listeleri", href: "/admin#pricing", icon: Tags },
  { label: "Stok yönetimi", href: "/admin#stock", icon: Boxes },
  { label: "Siparişler", href: "/admin/orders", icon: ClipboardList },
  { label: "Teklifler", href: "/admin/quotes", icon: ReceiptText },
  { label: "Audit logs", href: "/admin/import#audit", icon: ShieldCheck }
];

export function AdminFrame({ children, active }: { children: React.ReactNode; active: "dashboard" | "products" | "import" | "integrations" | "notifications" | "orders" | "quotes" }) {
  return (
    <main className="webAdminShell">
      <aside className="webAdminSidebar">
        <a className="adminBrand" href="/admin">
          <span>E</span>
          <strong>ENTAŞBURADA</strong>
        </a>
        <nav>
          {menu.map((item) => {
            const Icon = item.icon;
            const isActive =
              (active === "dashboard" && item.href === "/admin") ||
              (active === "products" && item.href === "/admin/products") ||
              (active === "import" && item.href === "/admin/import") ||
              (active === "integrations" && item.href === "/admin/integrations") ||
              (active === "notifications" && item.href === "/admin/notifications") ||
              (active === "orders" && item.href === "/admin/orders") ||
              (active === "quotes" && item.href === "/admin/quotes");
            return (
              <a href={item.href} key={item.label} className={isActive ? "active" : ""}>
                <Icon size={18} aria-hidden="true" />
                {item.label}
              </a>
            );
          })}
        </nav>
        <form action={logoutAction}>
          <button className="adminLogout" type="submit">
            <LockKeyhole size={17} aria-hidden="true" />
            Çıkış Yap
          </button>
        </form>
      </aside>
      <section className="webAdminMain">{children}</section>
    </main>
  );
}
