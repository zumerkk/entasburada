import { Bell } from "lucide-react";
import { StatusPill } from "@entas/ui";
import { requireAdmin } from "../../../lib/admin-auth";
import { listAdminNotifications } from "../../../lib/notification-repository";
import { AdminFrame } from "../AdminFrame";

export const dynamic = "force-dynamic";

export default async function AdminNotificationsPage() {
  await requireAdmin();
  const notifications = await listAdminNotifications(60);

  return (
    <AdminFrame active="notifications">
      <header className="adminTopbar">
        <div>
          <span>Bildirimler</span>
          <h1>Operasyon bildirim merkezi</h1>
        </div>
        <StatusPill tone="info">{notifications.length.toLocaleString("tr-TR")} kayıt</StatusPill>
      </header>

      <section className="panel">
        <div className="panelHeader compact">
          <h2>Son bildirimler</h2>
          <Bell size={20} aria-hidden="true" />
        </div>
        <div className="notificationList adminNotificationList">
          {notifications.map((notification) => (
            <a href={notification.href ?? "/admin"} className={notification.level} key={notification.id}>
              <strong>{notification.title}</strong>
              <span>{notification.body}</span>
              <small>{new Date(notification.createdAt).toLocaleString("tr-TR")}</small>
            </a>
          ))}
          {notifications.length === 0 ? <span className="emptyInline">Henüz bildirim yok.</span> : null}
        </div>
      </section>
    </AdminFrame>
  );
}
