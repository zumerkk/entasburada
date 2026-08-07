import { ArrowRight, BadgePercent, Boxes, Layers, Truck } from "lucide-react";

interface BulkQuoteCampaignProps {
  variant: "home" | "catalog" | "product";
  product?: {
    sku: string;
    name: string;
    unit: string;
  };
}

// Hacim basamaklari: yuzde oranlari kasitli olarak yok — gercek indirim orani
// teklife gore belirlendigi icin sayi yazmak yaniltici olurdu. Bunun yerine
// "hacim arttikca fiyat duser" iliskisi gorsel olarak anlatiliyor.
const TIERS = [
  { id: "koli", label: "Koli", Icon: Boxes },
  { id: "palet", label: "Palet", Icon: Layers },
  { id: "proje", label: "Proje", Icon: Truck }
] as const;

export function BulkQuoteCampaign({ variant, product }: BulkQuoteCampaignProps) {
  const quoteHref = product
    ? `/quote?sku=${encodeURIComponent(product.sku)}&name=${encodeURIComponent(product.name)}&unit=${encodeURIComponent(product.unit)}`
    : "/quote";

  return (
    <section
      className={`bulkQuoteCampaign ${variant}${variant === "product" ? "" : " shell"}`}
      aria-label="Toplu alım teklif kampanyası"
    >
      <span className="bulkQuoteCampaignHatch" aria-hidden="true" />
      <span className="bulkQuoteCampaignGlow" aria-hidden="true" />

      <div className="bulkQuoteCampaignCopy">
        <span className="bulkQuoteCampaignEyebrow">
          <BadgePercent size={14} aria-hidden="true" />
          Toplu alıma özel fiyat
        </span>
        <strong>
          Toplu alımlarda teklif oluşturun,{" "}
          <em>indirimli fiyatlarla</em> alışveriş yapın
        </strong>
        <p>
          {product
            ? "Bu ürünü koli, palet veya proje adediyle alacaksanız teklif oluşturun; miktarınıza özel fiyatı birlikte belirleyelim."
            : "Koli, palet veya proje ihtiyaçlarınızı tek teklifte toplayın; alım miktarınıza özel fiyatı birlikte belirleyelim."}
        </p>
      </div>

      {variant === "product" ? null : (
        <ol className="bulkQuoteCampaignTiers" aria-label="Alım hacmi arttıkça fiyat avantajı artar">
          {TIERS.map((tier, index) => (
            <li key={tier.id} style={{ "--tier-index": index } as React.CSSProperties}>
              <span className="bulkQuoteCampaignTierBar" aria-hidden="true" />
              <span className="bulkQuoteCampaignTierLabel">
                <tier.Icon size={14} aria-hidden="true" />
                {tier.label}
              </span>
            </li>
          ))}
          <li className="bulkQuoteCampaignTierNote" aria-hidden="true">
            hacim arttıkça
            <strong>fiyat düşer</strong>
          </li>
        </ol>
      )}

      <a className="bulkQuoteCampaignCta" href={quoteHref}>
        <span>{product ? "Bu Ürün İçin Teklif Al" : "Teklif Oluştur"}</span>
        <ArrowRight size={17} aria-hidden="true" />
      </a>
    </section>
  );
}
