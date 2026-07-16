import { ArrowRight, FileText, Gauge, PackageSearch, Truck } from "lucide-react";
import { ProductCard, TrustStrip } from "@entas/ui";
import { HomeHeroSlider } from "../components/HomeHeroSlider";
import { getCatalogNavigation, getCatalogOverview, getFeaturedPublicProducts } from "../lib/catalog-repository";
import { sectors, viewer } from "../data/catalog";

const trustItems = [
  { title: "Bayiye özel fiyat", body: "Fiyatlar yalnızca onaylı hesaplarda açılır." },
  { title: "Hızlı sipariş", body: "SKU, barkod veya Excel ile toplu sipariş altyapısı." },
  { title: "Teknik destek", body: "Ürün, alternatif ve doküman desteği tek merkezde." },
  { title: "Sevkiyat takibi", body: "Depo, teslimat ve sipariş durumu izlenebilir." }
];

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const [featuredProducts, overview, categoryCards] = await Promise.all([getFeaturedPublicProducts(8), getCatalogOverview(), getCatalogNavigation()]);
  const quickCards = categoryCards.slice(0, 12);

  return (
    <main>
      <HomeHeroSlider
        metrics={{
          activeProducts: formatCount(overview.store.importSummary.active),
          pricedProducts: formatCount(overview.store.importSummary.priced),
          stockedProducts: formatCount(overview.store.importSummary.inStock + overview.store.importSummary.lowStock)
        }}
      />

      <section className="shell quickCategories" aria-labelledby="quick-categories-title">
        <div className="sectionHeader">
          <div>
            <span className="eyebrow dark">Hızlı kategori</span>
            <h2 id="quick-categories-title">En çok kullanılan satın alma yolları</h2>
          </div>
          <a className="textLink" href="/catalog">
            Ana Katalog
            <ArrowRight size={16} aria-hidden="true" />
          </a>
        </div>
        <div className="categoryGrid">
          {quickCards.map((family) => (
            <a className="categoryCard" href={family.href} key={family.slug}>
              <span className="categoryCardMedia">
                <img src={family.imageUrl || "/images/hero-tools-v2.webp"} alt="" loading="lazy" decoding="async" />
                <span className="categoryCardIcon"><PackageSearch size={20} aria-hidden="true" /></span>
              </span>
              <span className="categoryCardBody">
                <strong>{family.label}</strong>
                <span>{formatCount(family.count)} ürün</span>
              </span>
              <ArrowRight className="categoryCardArrow" size={18} aria-hidden="true" />
            </a>
          ))}
        </div>
      </section>

      <section className="shell campaignBand">
        <div>
          <span className="eyebrow dark">Bayi kampanyaları</span>
          <h2>Koli, palet ve proje bazlı teklif akışları hazır</h2>
          <p>
            Ürün fiyatı görünmeden de teknik detay, stok durumu ve teklif talebi çalışır. Fiyatlandırma onaylı
            bayi hesabına göre açılır.
          </p>
        </div>
        <a className="btn btnPrimary" href="/quote">
          <FileText size={18} aria-hidden="true" />
          Toplu Teklif Talep Et
        </a>
      </section>

      <section className="shell productSection" aria-labelledby="featured-products-title">
        <div className="sectionHeader">
          <div>
            <span className="eyebrow dark">Öne çıkan ürünler</span>
            <h2 id="featured-products-title">Gerçek ithal katalog, fiyat kilitli gösterim</h2>
          </div>
          <a className="textLink" href="/catalog">
            Kataloğa git
            <ArrowRight size={16} aria-hidden="true" />
          </a>
        </div>
        <div className="productGrid">
          {featuredProducts.items.map((product) => (
            <ProductCard
              key={product.sku}
              href={`/products/${product.slug}`}
              brand={product.brand}
              name={product.name}
              sku={product.sku}
              category={product.category}
              image={product.image}
              stockTone={product.stockTone}
              stockLabel={product.stockLabel}
              badges={product.badges}
              isApprovedDealer={viewer.isApprovedDealer}
            />
          ))}
        </div>
      </section>

      <section className="sectorBand">
        <div className="shell">
          <div className="sectionHeader">
            <div>
              <span className="eyebrow">Sektöre göre çözümler</span>
              <h2>Satın alma alışkanlığınıza göre katalog yolları</h2>
            </div>
          </div>
          <div className="sectorGrid">
            {sectors.map((sector) => (
              <a href={sector.href} key={sector.label}>
                {sector.label}
              </a>
            ))}
          </div>
        </div>
      </section>

      <section className="shell trustSection">
        <TrustStrip items={trustItems} />
      </section>

      <section className="shell operationalBand">
        <div className="opItem">
          <Gauge size={22} aria-hidden="true" />
          <strong>Fiyat motoru</strong>
          <span>Müşteri, segment, marka, kategori, miktar ve teklif önceliği testlenebilir yapıdadır.</span>
        </div>
        <div className="opItem">
          <Truck size={22} aria-hidden="true" />
          <strong>Stok görünürlüğü</strong>
          <span>Ziyaretçi yalnızca stok durumunu görür; admin gerçek stok miktarını yönetir.</span>
        </div>
        <div className="opItem">
          <FileText size={22} aria-hidden="true" />
          <strong>Import altyapısı</strong>
          <span>Mirsan ve EuroMix XML kaynakları katalog deposuna senkronize edilir.</span>
        </div>
      </section>
    </main>
  );
}

function formatCount(value: number): string {
  return value.toLocaleString("tr-TR");
}
