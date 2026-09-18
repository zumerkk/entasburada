import { describe, expect, it } from "vitest";
import { ONLINE_WINDOW_MS, PresenceStore, RATE_LIMIT_PER_MINUTE, isValidPresenceSessionId, normalizePresencePath } from "./presence";

const dealer = { customerId: "c1", companyName: "Kaya Yapı", authorizedPerson: "Ali Kaya" };

describe("online presence", () => {
  it("counts sessions seen within the online window and groups dealer tabs", () => {
    const store = new PresenceStore();
    const now = 1_000_000;
    store.record("web-guest-aaaa1111", "/catalog", null, now);
    store.record("web-dealer-tab-1", "/cart", dealer, now - 30_000);
    store.record("web-dealer-tab-2", "/products/x", dealer, now - 10_000);
    store.record("web-stale-bbbb2222", "/", null, now - ONLINE_WINDOW_MS - 1);

    const snapshot = store.snapshot(now);
    expect(snapshot.onlineVisitors).toBe(3);
    expect(snapshot.onlineDealers).toBe(1);
    expect(snapshot.guests).toBe(1);
    expect(snapshot.dealers).toEqual([{ companyName: "Kaya Yapı", authorizedPerson: "Ali Kaya", path: "/products/x", secondsAgo: 10 }]);
    expect(snapshot.pages.map((page) => page.path)).toEqual(["/cart", "/catalog", "/products/x"]);
  });

  it("drops sessions after they go quiet", () => {
    const store = new PresenceStore();
    store.record("web-guest-aaaa1111", "/", null, 0);
    expect(store.snapshot(ONLINE_WINDOW_MS + 1).onlineVisitors).toBe(0);
  });

  it("rate limits noisy sources per minute", () => {
    const store = new PresenceStore();
    const results = Array.from({ length: RATE_LIMIT_PER_MINUTE + 1 }, () => store.allow("1.2.3.4", 5_000));
    expect(results.filter(Boolean)).toHaveLength(RATE_LIMIT_PER_MINUTE);
    expect(store.allow("1.2.3.4", 5_000 + 60_000)).toBe(true);
  });

  it("validates session ids and keeps only storefront paths", () => {
    expect(isValidPresenceSessionId("web-3f2b8c1e-1111-4222-8333-944455556666")).toBe(true);
    expect(isValidPresenceSessionId("<script>")).toBe(false);
    expect(normalizePresencePath("/catalog?q=kurek#top")).toBe("/catalog");
    expect(normalizePresencePath("/admin/orders")).toBeNull();
    expect(normalizePresencePath("https://evil.example/")).toBeNull();
    expect(normalizePresencePath("//evil.example")).toBeNull();
  });
});
