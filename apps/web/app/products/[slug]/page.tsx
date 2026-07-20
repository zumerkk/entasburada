import { notFound } from "next/navigation";
import { Box, FileText, Heart, PackageCheck, Scale, ShieldCheck, ShoppingCart, Truck } from "lucide-react";
import { PriceGate, StockBadge, StatusPill } from "@entas/ui";
import { AddToQuoteButton } from "../../../components/AddToQuoteButton";
import { ProductViewTracker } from "../../../components/AnalyticsTracker";
import { getPricedPublicProductBySlug, getPublicProductBySlug } from "../../../lib/catalog-repository";
import { getCurrentCustomer } from "../../../lib/customer-auth";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const product = await getPublicProductBySlug(slug);

  return {
    title: product ? `${product.name} | ENTAŞBURADA` : "Ürün | ENTAŞBURADA",
    description: product?.specs.map((spec) => `${spec.label}: ${spec.value}`).join(", ")
  };
}

export default async function ProductDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const customer = await getCurrentCustomer();
  const product = await getPricedPublicProductBySlug(slug, customer);

  if (!product) {
    notFound();
  }

  return (
    <main className="productDetailPage">
      <ProductViewTracker
        product={{
          productSlug: product.slug,
          productName: product.name,
          sku: product.sku,
          brand: product.brand,
          category: product.category
        }}
      />
      <section className="shell breadcrumb">
        <a href="/">Ana sayfa</a>
        <span>/</span>
        <a href={`/catalog?category=${encodeURIComponent(product.category)}`}>{product.category}</a>
        <span>/</span>
        <strong>{product.sku}</strong>
      </section>

      <section className="shell productDetailGrid">
        <div className="galleryPanel">
          <div className="mainProductImage">
            <img src={product.image} alt={product.name} />
          </div>
          <div className="thumbnailRow">
            <button type="button">
              <img src={product.image} alt="" />
            </button>
            <button type="button">
              <FileText size={20} aria-hidden="true" />
              Datasheet
            </button>
            <button type="button">
              <ShieldCheck size={20} aria-hidden="true" />
              Garanti
            </button>
          </div>
        </div>

        <article className="productInfoPanel">
          <div className="productTitleBlock">
            <div className="brandLine">
              <span>{product.brand}</span>
              <StatusPill tone="neutral">SKU: {product.sku}</StatusPill>
            </div>
            <h1>{product.name}</h1>
            <p>
              {product.barcode ? `Barkod ${product.barcode} · ` : ""}
              {product.manufacturerCode ? `Üretici kodu ${product.manufacturerCode} · ` : ""}
              Kategori {product.category}
            </p>
          </div>

          <div className="detailBadges">
            {product.badges.map((badge) => (
              <span className="campaignBadge" key={badge}>
                {badge}
              </span>
            ))}
          </div>

          <StockBadge tone={product.stockTone} label={product.stockLabel} />

          <PriceGate isApprovedDealer={Boolean(customer)} price={product.price} listPrice={product.listPrice} discountRate={product.discountRate} />

          <div className="purchaseRules">
            <div>
              <Box size={18} aria-hidden="true" />
              <span>Minimum teklif miktarı</span>
              <strong>
                {product.minOrder} {product.unitType}
              </strong>
            </div>
            <div>
              <PackageCheck size={18} aria-hidden="true" />
              <span>Stok görünümü</span>
              <strong>{product.stockLabel}</strong>
            </div>
            <div>
              <Truck size={18} aria-hidden="true" />
              <span>Teslimat</span>
              <strong>Temsilci teyidi</strong>
            </div>
            <div>
              <Scale size={18} aria-hidden="true" />
              <span>KDV</span>
              <strong>%{product.taxRate}</strong>
            </div>
          </div>

          <div className="detailActions">
            <AddToQuoteButton sku={product.sku} name={product.name} unit={product.unitType} />
            <button className="btn btnSecondary" type="button">
              <Heart size={18} aria-hidden="true" />
              Favoriye Al
            </button>
            <a
              className="btn btnSecondary"
              href={customer ? `/quick-order?sku=${encodeURIComponent(product.sku)}&name=${encodeURIComponent(product.name)}` : "/login?next=/quick-order"}
            >
              <ShoppingCart size={18} aria-hidden="true" />
              Hızlı Sipariş
            </a>
          </div>
        </article>
      </section>

      <section className="shell detailTabs">
        <div className="tabList" role="tablist" aria-label="Ürün detay sekmeleri">
          <button type="button" className="active">
            Açıklama
          </button>
          <button type="button">Teknik özellikler</button>
          <button type="button">Paketleme</button>
          <button type="button">Uyumlu ürünler</button>
          <button type="button">Dokümanlar</button>
          <button type="button">SSS</button>
        </div>
        <div className="tabPanel">
          <div>
            <h2>Ürün bilgileri</h2>
            {product.description ? <p className="productDescription">{product.description}</p> : null}
            <div className="specTable">
              {product.specs.map((spec) => (
                <div key={spec.label}>
                  <span>{spec.label}</span>
                  <strong>{spec.value}</strong>
                </div>
              ))}
              <div>
                <span>Paket içi adet</span>
                <strong>{product.packageQuantity}</strong>
              </div>
              <div>
                <span>Palet içi koli</span>
                <strong>{product.palletQuantity}</strong>
              </div>
              <div>
                <span>Garanti</span>
                <strong>{product.warrantyMonths ? `${product.warrantyMonths} ay` : "Ürün tipine bağlı"}</strong>
              </div>
            </div>
          </div>
          <aside className="documentList">
            <strong>Teknik dokümanlar</strong>
            <a href="/technical-documents">
              <FileText size={17} aria-hidden="true" />
              Ürün datasheet PDF
            </a>
            <a href="/technical-documents">
              <FileText size={17} aria-hidden="true" />
              Garanti belgesi
            </a>
            <a href="/technical-documents">
              <FileText size={17} aria-hidden="true" />
              Kullanım kılavuzu
            </a>
          </aside>
        </div>
      </section>
    </main>
  );
}
