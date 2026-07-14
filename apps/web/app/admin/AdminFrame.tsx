import {
  BarChart3,
  Boxes,
  Bell,
  BrainCircuit,
  ClipboardList,
  FileSpreadsheet,
  LayoutDashboard,
  LockKeyhole,
  PackageSearch,
  ReceiptText,
  Settings,
  ShieldCheck,
  Tags,
  UsersRound
} from "lucide-react";
import { getBrandSettings } from "../../lib/brand-settings";
import { logoutAction } from "./login/actions";

const menu = [
  { label: "Dashboard", href: "/admin", icon: LayoutDashboard },
  { label: "Satış zekası", href: "/admin/analytics", icon: BarChart3 },
  { label: "Ürünler", href: "/admin/products", icon: PackageSearch },
  { label: "Import merkezi", href: "/admin/import", icon: FileSpreadsheet },
  { label: "Akıllı import", href: "/admin/ai-import", icon: BrainCircuit },
  { label: "XML İzleme", href: "/admin/integrations", icon: Boxes },
  { label: "Bildirimler", href: "/admin/notifications", icon: Bell },
  { label: "Marka ayarları", href: "/admin/settings", icon: Settings },
  { label: "Bayiler", href: "/admin/dealers", icon: UsersRound },
  { label: "Fiyat listeleri", href: "/admin#pricing", icon: Tags },
  { label: "Stok yönetimi", href: "/admin#stock", icon: Boxes },
  { label: "Siparişler", href: "/admin/orders", icon: ClipboardList },
  { label: "Teklifler", href: "/admin/quotes", icon: ReceiptText },
  { label: "Audit logs", href: "/admin/import#audit", icon: ShieldCheck }
];

export type AdminFrameActive = "dashboard" | "analytics" | "products" | "import" | "ai-import" | "integrations" | "notifications" | "settings" | "orders" | "quotes" | "dealers";

export async function AdminFrame({ children, active }: { children: React.ReactNode; active: AdminFrameActive }) {
  const brandSettings = await getBrandSettings();

  return (
    <main className="webAdminShell">
      <aside className="webAdminSidebar">
        <a className="adminBrand" href="/admin">
          <span>
            <img src={brandSettings.adminLogoUrl} alt="" />
          </span>
          <strong>{brandSettings.siteTitle}</strong>
        </a>
        <nav>
          {menu.map((item) => {
            const Icon = item.icon;
            const isActive =
              (active === "dashboard" && item.href === "/admin") ||
              (active === "analytics" && item.href === "/admin/analytics") ||
              (active === "products" && item.href === "/admin/products") ||
              (active === "import" && item.href === "/admin/import") ||
              (active === "ai-import" && item.href === "/admin/ai-import") ||
              (active === "integrations" && item.href === "/admin/integrations") ||
              (active === "notifications" && item.href === "/admin/notifications") ||
              (active === "settings" && item.href === "/admin/settings") ||
              (active === "orders" && item.href === "/admin/orders") ||
              (active === "quotes" && item.href === "/admin/quotes") ||
              (active === "dealers" && item.href === "/admin/dealers");
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
