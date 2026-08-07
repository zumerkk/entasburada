import { ArrowRight, BadgePercent, Boxes } from "lucide-react";

interface BulkQuoteCampaignProps {
  variant: "home" | "catalog" | "product";
  product?: {
    sku: string;
    name: string;
    unit: string;
  };
}

export function BulkQuoteCampaign({ variant, product }: BulkQuoteCampaignProps) {
  const quoteHref = product
    ? `/quote?sku=${encodeURIComponent(product.sku)}&name=${encodeURIComponent(product.name)}&unit=${encodeURIComponent(product.unit)}`
    : "/quote";

  return (
    <section
      className={`bulkQuoteCampaign ${variant}${variant === "product" ? "" : " shell"}`}
      aria-label="Toplu alım kampanyası"
    >
      <span className="bulkQuoteCampaignIcon" aria-hidden="true">
        <Boxes size={28} />
      </span>
      <div className="bulkQuoteCampaignCopy">
        <span className="bulkQuoteCampaignEyebrow">
          <BadgePercent size={16} aria-hidden="true" />
          Toplu alıma özel avantaj
        </span>
        <strong>Toplu alımlarda teklif oluşturun, indirimli fiyatlarla alışveriş yapın</strong>
        <p>
          Koli, palet veya proje ihtiyaçlarınızı iletin; ekibimiz alım miktarınıza özel avantajlı fiyatı
          hazırlasın.
        </p>
      </div>
      <a className="btn btnPrimary bulkQuoteCampaignCta" href={quoteHref}>
        {product ? "Bu Ürün İçin Teklif Al" : "Teklif Oluştur"}
        <ArrowRight size={17} aria-hidden="true" />
      </a>
    </section>
  );
}
