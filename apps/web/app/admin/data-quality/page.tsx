import { AlertTriangle, CircleDollarSign, ImageOff, Layers } from "lucide-react";
import { StatusPill } from "@entas/ui";
import { requireAdmin } from "../../../lib/admin-auth";
import { loadCatalogStore } from "../../../lib/catalog-repository";
import { AdminFrame } from "../AdminFrame";

export const dynamic = "force-dynamic";

function toNumber(value: unknown): number {
  const n = parseFloat(String(value ?? "").replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

export default async function AdminDataQualityPage() {
  await requireAdmin();
  const store = await loadCatalogStore();
  const products = store.products ?? [];
  const total = products.length;

  // Kaynak bazında para birimi dağılımı — birden fazla birim = incelenmeli.
  const bySource = new Map<string, Map<string, number>>();
  for (const p of products) {
    const src = p.sourceName || p.sourceKey || "(bilinmeyen)";
    const cur = p.currency || "(yok)";
    if (!bySource.has(src)) bySource.set(src, new Map());
    const m = bySource.get(src)!;
    m.set(cur, (m.get(cur) ?? 0) + 1);
  }
  const mixedSources = [...bySource.entries()]
    .map(([src, m]) => ({ src, breakdown: [...m.entries()].sort((a, b) => b[1] - a[1]), total: [...m.values()].reduce((a, b) => a + b, 0) }))
    .filter((row) => row.breakdown.length > 1)
    .sort((a, b) => b.total - a.total);

  const zeroPrice = products.filter((p) => toNumber(p.listPrice) === 0);
  const noImage = products.filter((p) => !p.imageUrl);
  const suspiciousLowPrice = products.filter((p) => {
    const v = toNumber(p.listPrice);
    return v > 0 && v < 1; // 1 birimden düşük — OCR ile parçalanmış fiyat şüphesi
  });

  return (
    <AdminFrame active="data-quality">
      <header className="adminTopbar">
        <div>
          <span>Katalog sağlığı</span>
          <h1>Veri kalitesi</h1>
        </div>
      </header>

      <section className="dqStatGrid">
        <StatCard icon={<Layers size={18} />} label="Toplam ürün" value={total} />
        <StatCard icon={<AlertTriangle size={18} />} label="Karışık para birimli katalog" value={mixedSources.length} tone={mixedSources.length ? "warn" : "ok"} />
        <StatCard icon={<CircleDollarSign size={18} />} label="Fiyatı 0 / boş" value={zeroPrice.length} tone={zeroPrice.length ? "warn" : "ok"} />
        <StatCard icon={<ImageOff size={18} />} label="Görseli yok" value={noImage.length} tone={noImage.length ? "warn" : "ok"} />
      </section>

      <article className="panel dqPanel">
        <h2>Para birimi karışık kataloglar</h2>
        <p className="dqHint">Bir fiyat listesi genelde tek para birimindedir. Aşağıdakiler birden fazla birim içeriyor — azınlıktaki birim çoğunlukla AI aktarım hatasıdır (istisna: EuroMix gibi gerçekten karışık tedarikçi feed’leri).</p>
        {mixedSources.length === 0 ? (
          <p>Karışık katalog yok. ✅</p>
        ) : (
          <div className="dqTable">
            {mixedSources.map((row) => (
              <div key={row.src} className="dqRow">
                <strong>{row.src}</strong>
                <div className="dqBadges">
                  {row.breakdown.map(([cur, count]) => (
                    <StatusPill key={cur} tone={cur === row.breakdown[0]![0] ? "info" : "danger"}>
                      {cur}: {count}
                    </StatusPill>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </article>

      <article className="panel dqPanel">
        <h2>Fiyatı 0 / boş ürünler ({zeroPrice.length})</h2>
        <p className="dqHint">Vitrinde kalıyorlar (talebiniz üzerine gizlenmedi). Fiyat girilene kadar müşteri “0” görür.</p>
        <IssueTable items={zeroPrice.slice(0, 100)} />
        {zeroPrice.length > 100 ? <p className="dqHint">… ve {zeroPrice.length - 100} tane daha.</p> : null}
      </article>

      {suspiciousLowPrice.length > 0 ? (
        <article className="panel dqPanel">
          <h2>Şüpheli düşük fiyat ({suspiciousLowPrice.length})</h2>
          <p className="dqHint">1 birimden düşük — OCR sırasında parçalanmış fiyat olabilir (ör. “1 00,00” → 100,00). Kontrol edin.</p>
          <IssueTable items={suspiciousLowPrice.slice(0, 50)} />
        </article>
      ) : null}
    </AdminFrame>
  );
}

function StatCard({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: number; tone?: "ok" | "warn" }) {
  return (
    <div className={`dqStat ${tone === "warn" ? "dqStatWarn" : ""}`}>
      <span className="dqStatIcon">{icon}</span>
      <div>
        <strong>{value.toLocaleString("tr-TR")}</strong>
        <span>{label}</span>
      </div>
    </div>
  );
}

function IssueTable({ items }: { items: Array<{ id: string; name?: string; sku?: string; currency?: string; listPrice?: string; sourceName?: string }> }) {
  if (items.length === 0) return <p>Kayıt yok. ✅</p>;
  return (
    <div className="dqIssueTable">
      <div className="dqIssueHead">
        <span>Ürün</span>
        <span>Kod</span>
        <span>Fiyat</span>
        <span>Katalog</span>
      </div>
      {items.map((p) => (
        <div className="dqIssueRow" key={p.id}>
          <span>{p.name}</span>
          <span>{p.sku || "-"}</span>
          <span>
            {p.listPrice} {p.currency}
          </span>
          <span>{p.sourceName}</span>
        </div>
      ))}
    </div>
  );
}
