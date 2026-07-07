import type { ReactNode } from "react";
import {
  ArrowRight,
  BarChart3,
  CheckCircle2,
  FileText,
  LockKeyhole,
  PackageCheck,
  PackageX,
  Search,
  ShieldCheck,
  ShoppingCart,
  Sparkles,
  TriangleAlert
} from "lucide-react";

export type StockTone = "in_stock" | "low_stock" | "incoming" | "out_of_stock";

export interface PriceGateProps {
  isApprovedDealer: boolean;
  price?: string | undefined;
  listPrice?: string | undefined;
  discountRate?: string | undefined;
  compact?: boolean | undefined;
}

export function PriceGate({ isApprovedDealer, price, listPrice, discountRate, compact = false }: PriceGateProps) {
  if (isApprovedDealer && price) {
    return (
      <div className={compact ? "priceBlock compact" : "priceBlock"}>
        {listPrice ? <span className="listPrice">{listPrice}</span> : null}
        <strong>{price}</strong>
        {discountRate ? <span className="discount">{discountRate} iskonto</span> : null}
      </div>
    );
  }

  if (isApprovedDealer) {
    return (
      <div className={compact ? "priceGate compact" : "priceGate"}>
        <div className="priceGateTitle">
          <FileText size={16} aria-hidden="true" />
          <span>Fiyat için temsilcinizle iletişime geçin.</span>
        </div>
      </div>
    );
  }

  return (
    <div className={compact ? "priceGate compact" : "priceGate"}>
      <div className="priceGateTitle">
        <LockKeyhole size={16} aria-hidden="true" />
        <span>Bayi fiyatlarını görmek ve sipariş oluşturmak için giriş yapın.</span>
      </div>
      {!compact ? (
        <div className="priceGateActions">
          <a className="btn btnPrimary" href="/login">
            <ShieldCheck size={16} aria-hidden="true" />
            Bayi Girişi
          </a>
          <a className="btn btnSecondary" href="/dealer-application">
            <FileText size={16} aria-hidden="true" />
            Bayi Başvurusu
          </a>
          <a className="btn btnGhost" href="/quote">
            <ArrowRight size={16} aria-hidden="true" />
            Teklif Talep Et
          </a>
        </div>
      ) : null}
    </div>
  );
}

export function StockBadge({ tone, label }: { tone: StockTone; label: string }) {
  const Icon = tone === "out_of_stock" ? PackageX : tone === "low_stock" ? TriangleAlert : PackageCheck;
  return (
    <span className={`stockBadge ${tone}`}>
      <Icon size={14} aria-hidden="true" />
      {label}
    </span>
  );
}

export interface ProductCardProps {
  href: string;
  brand: string;
  name: string;
  sku: string;
  category: string;
  image: string;
  stockTone: StockTone;
  stockLabel: string;
  badges?: string[] | undefined;
  isApprovedDealer: boolean;
  price?: string | undefined;
  listPrice?: string | undefined;
  discountRate?: string | undefined;
}

export function ProductCard(props: ProductCardProps) {
  return (
    <article className="productCard">
      <a className="productImageWrap" href={props.href} aria-label={`${props.name} detayına git`}>
        <img src={props.image} alt={props.name} loading="lazy" />
        {props.badges?.length ? (
          <div className="badgeRow">
            {props.badges.slice(0, 3).map((badge) => (
              <span className="campaignBadge" key={badge}>
                {badge}
              </span>
            ))}
          </div>
        ) : null}
      </a>
      <div className="productCardBody">
        <div className="productMeta">
          <span>{props.brand}</span>
          <span>{props.sku}</span>
        </div>
        <a className="productName" href={props.href}>
          {props.name}
        </a>
        <div className="productCategory">{props.category}</div>
        <StockBadge tone={props.stockTone} label={props.stockLabel} />
        <PriceGate
          isApprovedDealer={props.isApprovedDealer}
          price={props.price}
          listPrice={props.listPrice}
          discountRate={props.discountRate}
          compact
        />
        <div className="productActions">
          <a className="iconButton" href={props.href} title="Ürün detayı">
            <Search size={17} aria-hidden="true" />
          </a>
          <a className="iconButton" href={`/quote?sku=${encodeURIComponent(props.sku)}&name=${encodeURIComponent(props.name)}`} title="Teklif listesine ekle">
            <FileText size={17} aria-hidden="true" />
          </a>
          <a
            className={props.isApprovedDealer ? "iconButton" : "iconButton disabled"}
            href={props.isApprovedDealer ? `/quick-order?sku=${encodeURIComponent(props.sku)}&name=${encodeURIComponent(props.name)}` : "/login?next=/quick-order"}
            title={props.isApprovedDealer ? "Hızlı siparişe ekle" : "Sepet için bayi girişi gerekir"}
          >
            <ShoppingCart size={17} aria-hidden="true" />
          </a>
        </div>
      </div>
    </article>
  );
}

export function MetricCard({
  label,
  value,
  trend,
  tone = "default"
}: {
  label: string;
  value: string;
  trend?: string;
  tone?: "default" | "warning" | "success" | "info";
}) {
  return (
    <section className={`metricCard ${tone}`}>
      <div className="metricIcon">
        <BarChart3 size={18} aria-hidden="true" />
      </div>
      <span>{label}</span>
      <strong>{value}</strong>
      {trend ? <small>{trend}</small> : null}
    </section>
  );
}

export function StatusPill({ children, tone = "info" }: { children: ReactNode; tone?: "success" | "warning" | "danger" | "info" | "neutral" }) {
  return <span className={`statusPill ${tone}`}>{children}</span>;
}

export function EmptyState({ title, body, action }: { title: string; body: string; action?: ReactNode }) {
  return (
    <section className="emptyState">
      <Sparkles size={22} aria-hidden="true" />
      <strong>{title}</strong>
      <p>{body}</p>
      {action}
    </section>
  );
}

export function TrustStrip({ items }: { items: Array<{ title: string; body: string }> }) {
  return (
    <div className="trustStrip">
      {items.map((item) => (
        <div className="trustItem" key={item.title}>
          <CheckCircle2 size={18} aria-hidden="true" />
          <div>
            <strong>{item.title}</strong>
            <span>{item.body}</span>
          </div>
        </div>
      ))}
    </div>
  );
}
