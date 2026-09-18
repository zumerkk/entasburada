"use client";

import { useEffect, useState } from "react";
import { Radio, Store, UserRound, UsersRound } from "lucide-react";
import type { PresenceSnapshot } from "../../lib/presence";

const REFRESH_MS = 20_000;

function usePresenceSnapshot(): { snapshot: PresenceSnapshot | null; failed: boolean } {
  const [snapshot, setSnapshot] = useState<PresenceSnapshot | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    // İlk yükleme her zaman yapılır; periyodik yenileme yalnız sekme görünürken.
    const load = async (force = false) => {
      if (!force && document.visibilityState !== "visible") return;
      try {
        const response = await fetch("/api/admin/presence", { cache: "no-store" });
        if (!response.ok) throw new Error(String(response.status));
        const payload = (await response.json()) as PresenceSnapshot;
        if (!cancelled) {
          setSnapshot(payload);
          setFailed(false);
        }
      } catch {
        if (!cancelled) setFailed(true);
      }
    };
    const refresh = () => void load();
    void load(true);
    const timer = window.setInterval(refresh, REFRESH_MS);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, []);

  return { snapshot, failed };
}

/** Kenar çubuğundaki kısa gösterge: tüm admin sayfalarında görünür. */
export function OnlineNowBadge() {
  const { snapshot, failed } = usePresenceSnapshot();
  return (
    <a className="adminOnlineBadge" href="/admin#online" title="Son 2 dakikada sitede sayfası açık olan ziyaretçiler">
      <span className={`adminOnlineDot${snapshot && snapshot.onlineVisitors > 0 ? " live" : ""}`} aria-hidden="true" />
      {snapshot ? (
        <span>
          <strong>{snapshot.onlineVisitors.toLocaleString("tr-TR")}</strong> online
          <small> · {snapshot.onlineDealers.toLocaleString("tr-TR")} bayi</small>
        </span>
      ) : (
        <span>{failed ? "Online sayısı alınamadı" : "Online sayılıyor…"}</span>
      )}
    </a>
  );
}

/** Panodaki ayrıntı: online bayiler ve en çok bakılan sayfalar. */
export function OnlineNowPanel() {
  const { snapshot, failed } = usePresenceSnapshot();
  return (
    <section className="panel adminOnlinePanel" id="online">
      <div className="panelHeader compact">
        <div>
          <h2>
            <Radio size={19} aria-hidden="true" /> Şu an sitede
          </h2>
          <p>Son 2 dakikada sayfası açık olan ziyaretçiler; 20 saniyede bir yenilenir. Sunucu yeniden başlarsa sayaç sıfırdan başlar.</p>
        </div>
      </div>
      {failed && !snapshot ? <p className="formError">Online bilgisi alınamadı.</p> : null}
      <div className="adminOnlineStats">
        <div>
          <UsersRound size={20} aria-hidden="true" />
          <span>Online ziyaretçi</span>
          <strong>{snapshot ? snapshot.onlineVisitors.toLocaleString("tr-TR") : "–"}</strong>
        </div>
        <div>
          <Store size={20} aria-hidden="true" />
          <span>Giriş yapmış bayi</span>
          <strong>{snapshot ? snapshot.onlineDealers.toLocaleString("tr-TR") : "–"}</strong>
        </div>
        <div>
          <UserRound size={20} aria-hidden="true" />
          <span>Misafir</span>
          <strong>{snapshot ? snapshot.guests.toLocaleString("tr-TR") : "–"}</strong>
        </div>
      </div>
      {snapshot ? (
        <div className="adminOnlineLists">
          <div>
            <h3>Online bayiler</h3>
            {snapshot.dealers.length ? (
              <ul>
                {snapshot.dealers.map((dealer) => (
                  <li key={`${dealer.companyName}-${dealer.authorizedPerson}`}>
                    <strong>{dealer.companyName}</strong>
                    <small>
                      {dealer.authorizedPerson} · {dealer.path} · {dealer.secondsAgo < 60 ? `${dealer.secondsAgo} sn önce` : `${Math.round(dealer.secondsAgo / 60)} dk önce`}
                    </small>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="adminProductPickerEmpty">Şu an giriş yapmış bayi yok.</p>
            )}
          </div>
          <div>
            <h3>Açık sayfalar</h3>
            {snapshot.pages.length ? (
              <ul>
                {snapshot.pages.map((page) => (
                  <li key={page.path}>
                    <strong>{page.path}</strong>
                    <small>{page.visitors.toLocaleString("tr-TR")} kişi</small>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="adminProductPickerEmpty">Şu an açık sayfa yok.</p>
            )}
          </div>
        </div>
      ) : null}
    </section>
  );
}
