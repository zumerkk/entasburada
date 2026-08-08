import { ArrowRight, Boxes, FileText, Layers, Truck } from "lucide-react";

interface BulkQuoteCampaignProps {
  variant: "home" | "catalog" | "product";
  product?: {
    sku: string;
    name: string;
    unit: string;
  };
}

// Teklif akışı fiyatı kişiselleştirmez; toplu ürünlerin stok, paketleme ve
// sevkiyat planını tek talepte netleştirir.
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
          <FileText size={14} aria-hidden="true" />
          Toplu alım teklifi
        </span>
        <strong>
          Toplu alımlarda ürünleri tek teklifte toplayın,{" "}
          <em>sevkiyatı birlikte planlayın</em>
        </strong>
        <p>
          {product
            ? "Bu ürünü koli, palet veya proje adediyle alacaksanız ortak fiyatla teklif oluşturun; stok ve sevkiyat koşullarını netleştirelim."
            : "Koli, palet veya proje ihtiyaçlarınızı ortak fiyatlarla tek teklifte toplayın; stok ve sevkiyat koşullarını netleştirelim."}
        </p>
      </div>

      {variant === "product" ? null : (
        <ol className="bulkQuoteCampaignTiers" aria-label="Koli, palet ve proje teklif seçenekleri">
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
            <strong>planlama kolaylaşır</strong>
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
