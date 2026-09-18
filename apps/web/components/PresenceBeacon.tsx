"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { getSessionId } from "./AnalyticsTracker";

const HEARTBEAT_MS = 45_000;

/**
 * Admin panelindeki "şu an online" sayacı için hafif sinyal. Yalnız sekme
 * görünürken gönderilir; admin sayfaları sayılmaz. Oturum kimliği analitik
 * izleyiciyle aynı sekme bazlı sessionStorage kaydıdır.
 */
export function PresenceBeacon() {
  const pathname = usePathname();

  useEffect(() => {
    if (!pathname || pathname === "/admin" || pathname.startsWith("/admin/")) return;

    const send = () => {
      if (document.visibilityState !== "visible") return;
      const body = JSON.stringify({ sessionId: getSessionId(), path: pathname });
      try {
        if (navigator.sendBeacon?.("/api/presence", new Blob([body], { type: "application/json" }))) return;
      } catch {
        // sendBeacon kullanılamıyorsa fetch ile devam edilir.
      }
      fetch("/api/presence", { method: "POST", headers: { "content-type": "application/json" }, body, keepalive: true }).catch(() => undefined);
    };

    send();
    const timer = window.setInterval(send, HEARTBEAT_MS);
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") send();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [pathname]);

  return null;
}
