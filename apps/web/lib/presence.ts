/**
 * "Şu an kaç kişi online" sayacı.
 *
 * Mağaza sayfaları görünür sekmedeyken ~45 sn'de bir sinyal gönderir; son
 * ONLINE_WINDOW_MS içinde sinyali gelen oturum online sayılır. Veri yalnız süreç
 * belleğinde tutulur (tek Render örneği): IP saklanmaz, yeniden başlatmada sıfırlanır.
 */

export const ONLINE_WINDOW_MS = 2 * 60 * 1000;
const MAX_ENTRIES = 5_000;
// Aynı ofis/NAT arkasındaki çok sayıda sekme ~45 sn'de bir sinyal gönderir; sınır bunu kesmemeli.
export const RATE_LIMIT_PER_MINUTE = 120;

export interface PresenceIdentity {
  customerId: string;
  companyName: string;
  authorizedPerson: string;
}

interface PresenceEntry {
  lastSeen: number;
  path: string;
  identity?: PresenceIdentity;
}

export interface PresenceSnapshot {
  onlineVisitors: number;
  onlineDealers: number;
  guests: number;
  dealers: Array<{ companyName: string; authorizedPerson: string; path: string; secondsAgo: number }>;
  pages: Array<{ path: string; visitors: number }>;
  windowSeconds: number;
  generatedAt: string;
}

export class PresenceStore {
  private readonly entries = new Map<string, PresenceEntry>();
  private readonly rate = new Map<string, { count: number; resetAt: number }>();

  record(sessionId: string, path: string, identity: PresenceIdentity | null, now = Date.now()): void {
    this.prune(now);
    if (!this.entries.has(sessionId) && this.entries.size >= MAX_ENTRIES) return;
    this.entries.set(sessionId, { lastSeen: now, path, ...(identity ? { identity } : {}) });
  }

  /** Aynı kaynaktan dakikada en fazla RATE_LIMIT_PER_MINUTE sinyal. */
  allow(source: string, now = Date.now()): boolean {
    const current = this.rate.get(source);
    if (!current || current.resetAt <= now) {
      if (this.rate.size >= MAX_ENTRIES) this.pruneRate(now);
      this.rate.set(source, { count: 1, resetAt: now + 60_000 });
      return true;
    }
    current.count += 1;
    return current.count <= RATE_LIMIT_PER_MINUTE;
  }

  snapshot(now = Date.now()): PresenceSnapshot {
    this.prune(now);
    const active = [...this.entries.values()];
    // Aynı bayinin birden fazla sekmesi tek bayi sayılır.
    const dealersById = new Map<string, PresenceEntry>();
    for (const entry of active) {
      if (!entry.identity) continue;
      const previous = dealersById.get(entry.identity.customerId);
      if (!previous || previous.lastSeen < entry.lastSeen) dealersById.set(entry.identity.customerId, entry);
    }
    const pageCounts = new Map<string, number>();
    for (const entry of active) pageCounts.set(entry.path, (pageCounts.get(entry.path) ?? 0) + 1);

    return {
      onlineVisitors: active.length,
      onlineDealers: dealersById.size,
      guests: active.filter((entry) => !entry.identity).length,
      dealers: [...dealersById.values()]
        .sort((left, right) => right.lastSeen - left.lastSeen)
        .slice(0, 50)
        .map((entry) => ({
          companyName: entry.identity!.companyName,
          authorizedPerson: entry.identity!.authorizedPerson,
          path: entry.path,
          secondsAgo: Math.max(0, Math.round((now - entry.lastSeen) / 1000))
        })),
      pages: [...pageCounts.entries()]
        .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
        .slice(0, 10)
        .map(([path, visitors]) => ({ path, visitors })),
      windowSeconds: ONLINE_WINDOW_MS / 1000,
      generatedAt: new Date(now).toISOString()
    };
  }

  private prune(now: number): void {
    for (const [key, entry] of this.entries) {
      if (now - entry.lastSeen > ONLINE_WINDOW_MS) this.entries.delete(key);
    }
  }

  private pruneRate(now: number): void {
    for (const [key, entry] of this.rate) {
      if (entry.resetAt <= now) this.rate.delete(key);
    }
  }
}

/** Oturum kimliği AnalyticsTracker ile aynı biçimdedir: "web-" + UUID. */
export function isValidPresenceSessionId(value: unknown): value is string {
  return typeof value === "string" && /^web-[A-Za-z0-9-]{8,64}$/.test(value);
}

/** Yalnız mağaza yolu tutulur: sorgu/parça atılır, admin ve API yolları sayılmaz. */
export function normalizePresencePath(value: unknown): string | null {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//")) return null;
  const path = value.split(/[?#]/)[0]!.slice(0, 160) || "/";
  if (path === "/admin" || path.startsWith("/admin/") || path.startsWith("/api/")) return null;
  return path;
}

/** Route bundle'ları arasında tek sayaç paylaşılsın diye süreç genelinde saklanır. */
export function getPresenceStore(): PresenceStore {
  const holder = globalThis as typeof globalThis & { __entasPresenceStore?: PresenceStore };
  holder.__entasPresenceStore ??= new PresenceStore();
  return holder.__entasPresenceStore;
}
