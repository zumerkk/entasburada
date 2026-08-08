import { ArrowRight, BadgeCheck, PackageCheck, Truck } from "lucide-react";

export function FreeShippingBanner({ variant = "catalog" }: { variant?: "catalog" | "product" }) {
  return (
    <aside className={`freeShippingBanner ${variant}`} aria-label="10.000 TL ve üzeri ücretsiz kargo avantajı">
      <span className="freeShippingVisual" aria-hidden="true">
        <span />
        <Truck size={variant === "product" ? 28 : 36} strokeWidth={1.8} />
      </span>

      <div className="freeShippingCopy">
        <span className="freeShippingEyebrow">
          <BadgeCheck size={15} aria-hidden="true" />
          ENTAŞBURADA teslimat avantajı
        </span>
        <strong>
          <em>10.000 TL</em> ve üzeri sepetlerde kargo bizden
        </strong>
        <p>KDV dahil ürün toplamınız bareme ulaştığında avantaj sepetinize otomatik uygulanır.</p>
      </div>

      <div className="freeShippingBenefits" aria-label="Kargo avantajı özellikleri">
        <span>
          <PackageCheck size={16} aria-hidden="true" />
          Tüm onaylı müşterilerde geçerli
        </span>
        <span>
          <BadgeCheck size={16} aria-hidden="true" />
          Kupon gerektirmez
        </span>
      </div>

      <a className="freeShippingCta" href="/catalog">
        Alışverişe başla
        <ArrowRight size={17} aria-hidden="true" />
      </a>
    </aside>
  );
}
