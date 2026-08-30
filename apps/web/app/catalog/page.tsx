import { Filter, Search, SlidersHorizontal, Sparkles } from "lucide-react";
import { EmptyState, ProductCard, StatusPill } from "@entas/ui";
import { AddToCartControl } from "../../components/AddToCartControl";
import { CatalogSearchTracker } from "../../components/AnalyticsTracker";
import { BulkQuoteCampaign } from "../../components/BulkQuoteCampaign";
import { FreeShippingBanner } from "../../components/FreeShippingBanner";
import { getAlternativePricedProducts, getCatalogFacets, getCatalogNavigation, getCatalogTechnicalFacets, getPricedPublicProducts } from "../../lib/catalog-repository";
import { getCurrentCustomer } from "../../lib/customer-auth";

type SearchParams = Record<string, string | string[] | undefined>;

export const dynamic = "force-dynamic";

const CATALOG_PAGE_SIZE = 72;

export default async function CatalogPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const q = getParam(params, "q");
  const category = getParam(params, "category");
  const group = getParam(params, "group");
  const view = getParam(params, "view");
  const brand = getParam(params, "brand");
  const sourceKey = getParam(params, "sourceKey");
  const size = getParam(params, "size");
  const diameter = getParam(params, "diameter");
  const connection = getParam(params, "connection");
  const material = getParam(params, "material");
  const usage = getParam(params, "usage");
  const page = Math.max(1, Number(getParam(params, "page") || "1"));
  const limit = CATALOG_PAGE_SIZE;
  const offset = (page - 1) * limit;

  const customer = await getCurrentCustomer();
  const [facets, technicalFacets, navigation, products] = await Promise.all([
    getCatalogFacets(true),
    getCatalogTechnicalFacets(true),
    getCatalogNavigation(),
    getPricedPublicProducts({ q, category, categoryGroup: group, view, brand, sourceKey, size, diameter, connection, material, usage, limit, offset }, customer)
  ]);
  const alternatives = products.items.length === 0 && q ? await getAlternativePricedProducts(q, customer, 8) : null;
  const safePage = Math.floor(products.offset / products.limit) + 1;
  const pageCount = Math.max(1, Math.ceil(products.total / products.limit));
  const visibleStart = products.total > 0 ? products.offset + 1 : 0;
  const visibleEnd = Math.min(products.offset + products.items.length, products.total);

  return (
    <main className="catalogPage">
      <CatalogSearchTracker searchTerm={q} resultCount={products.total} category={category} group={group || products.appliedCategoryLabel} brand={brand} />
      <section className="shell pageIntro compact">
        <div>
          <span className="eyebrow dark">Ürün kataloğu</span>
          <h1>Tüm kategoriler ve teknik ürün listesi</h1>
          <p>{products.total.toLocaleString("tr-TR")} ürün listeleniyor. {customer ? `${customer.companyName} hesabında herkes için geçerli ortak marka fiyatları gösteriliyor.` : "Fiyat, sepet ve ödeme aksiyonları yalnızca onaylı bayi hesaplarında açılır."}</p>
        </div>
        <a className="btn btnSecondary" href="/dealer-application">
          Bayi Başvurusu
        </a>
      </section>

      <section className="shell catalogShippingSection">
        <FreeShippingBanner variant="catalog" />
      </section>

      <BulkQuoteCampaign variant="catalog" />

      <section className="shell catalogLayout catalogLayoutWide">
        <aside className="filterPanel" aria-label="Katalog filtreleri">
          <div className="filterTitle">
            <Filter size={18} aria-hidden="true" />
            Filtreler
          </div>
          <form className="filterForm" action="/catalog">
            <input type="hidden" name="group" value={group} />
            <input type="hidden" name="view" value={view} />
            <label>
              Arama
              <input name="q" defaultValue={q} placeholder="Ürün, SKU, barkod veya marka" />
            </label>
            <label>
              Marka
              <select name="brand" defaultValue={brand}>
                <option value="">Tüm markalar</option>
                {facets.brands.slice(0, 80).map((item) => (
                  <option value={item} key={item}>
                    {item}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Kaynak
              <select name="sourceKey" defaultValue={sourceKey}>
                <option value="">Tüm kaynaklar</option>
                {facets.sources.map((source) => (
                  <option value={source.key} key={source.key}>
                    {source.name}
                  </option>
                ))}
              </select>
            </label>
            <details className="advancedFilters" open={Boolean(size || diameter || connection || material || usage)}>
              <summary>Teknik özellik filtreleri</summary>
              <label>
                Ölçü / ebat
                <input name="size" defaultValue={size} list="catalog-size-options" placeholder="Örn. 25 mm, 1/2" />
              </label>
              <label>
                Çap
                <input name="diameter" defaultValue={diameter} list="catalog-diameter-options" placeholder="Örn. DN50" />
              </label>
              <label>
                Bağlantı tipi
                <input name="connection" defaultValue={connection} list="catalog-connection-options" placeholder="Örn. iç diş" />
              </label>
              <label>
                Malzeme
                <input name="material" defaultValue={material} list="catalog-material-options" placeholder="Örn. pirinç, PPRC" />
              </label>
              <label>
                Kullanım alanı
                <input name="usage" defaultValue={usage} list="catalog-usage-options" placeholder="Örn. bahçe, sıcak su" />
              </label>
            </details>
            <FacetOptions id="catalog-size-options" values={technicalFacets.sizes} />
            <FacetOptions id="catalog-diameter-options" values={technicalFacets.diameters} />
            <FacetOptions id="catalog-connection-options" values={technicalFacets.connections} />
            <FacetOptions id="catalog-material-options" values={technicalFacets.materials} />
            <FacetOptions id="catalog-usage-options" values={technicalFacets.usages} />
            <button className="btn btnPrimary" type="submit">
              <Search size={17} aria-hidden="true" />
              Filtrele
            </button>
          </form>
          <div className="filterGroup">
            <strong>Hızlı katalog</strong>
            {navigation.map((item) => (
              <a href={item.href} key={item.slug}>
                {item.label} · {item.count.toLocaleString("tr-TR")}
              </a>
            ))}
          </div>
          <div className="filterGroup">
            <strong>Kaynak kategorileri</strong>
            {facets.categories.slice(0, 16).map((item) => (
              <a href={`/catalog?category=${encodeURIComponent(item)}`} key={item}>
                {item}
              </a>
            ))}
          </div>
        </aside>

        <div className="catalogResults">
          <div className="resultToolbar">
            <div>
              <strong>{products.total.toLocaleString("tr-TR")} ürün listeleniyor</strong>
              <span>
                {visibleStart.toLocaleString("tr-TR")}–{visibleEnd.toLocaleString("tr-TR")} arası gösteriliyor · Sayfa başına {CATALOG_PAGE_SIZE.toLocaleString("tr-TR")} ürün
              </span>
            </div>
            <a className="btn btnGhost dark" href="/catalog">
              <SlidersHorizontal size={17} aria-hidden="true" />
              Sıfırla
            </a>
          </div>
          <div className="activeFilters">
            <StatusPill tone="success">Gerçek stok ve termin görünümü</StatusPill>
            <StatusPill tone={customer ? "success" : "warning"}>{customer ? "Fiyat görünümü: ortak, KDV dahil" : "Fiyat görünümü: bayi girişi gerekli"}</StatusPill>
            {q ? <StatusPill tone="neutral">Arama: {q}</StatusPill> : null}
            {products.searchMode === "fuzzy" ? <StatusPill tone="info">Yazım hatası düzeltilerek eşleştirildi</StatusPill> : null}
            {products.searchMode === "synonym" ? <StatusPill tone="info">Teknik eş anlamlılarla eşleştirildi</StatusPill> : null}
            {category ? <StatusPill tone="neutral">Kategori: {category}</StatusPill> : null}
            {group ? <StatusPill tone="neutral">Grup: {products.appliedCategoryLabel ?? group}</StatusPill> : null}
          </div>
          {products.fallback ? <div className="catalogNotice">{products.fallback.message}</div> : null}
          {products.items.length > 0 ? (
            <div className="productGrid dense catalogProductGrid">
              {products.items.map((product) => (
                <ProductCard
                  key={product.slug}
                  href={`/products/${product.slug}`}
                  brand={product.brand}
                  name={product.name}
                  sku={product.sku}
                  category={product.category}
                  image={product.image}
                  stockTone={product.stockTone}
                  stockLabel={product.stockLabel}
                  badges={product.badges}
                  isApprovedDealer={Boolean(customer)}
                  price={product.price}
                  listPrice={product.listPrice}
                  discountRate={product.discountRate}
                  priceLabel={product.priceLabel}
                  priceUnavailableMessage={product.priceUnavailableMessage}
                  cartAction={
                    <AddToCartControl
                      slug={product.slug}
                      sku={product.sku}
                      name={product.name}
                      unit={product.unitType}
                      minOrder={product.minOrder}
                      isAuthenticated={Boolean(customer)}
                    />
                  }
                />
              ))}
            </div>
          ) : alternatives && alternatives.items.length > 0 ? (
            <section className="searchAlternatives">
              <div className="searchAlternativesHeader">
                <Sparkles size={20} aria-hidden="true" />
                <div>
                  <h2>Yakın alternatifler</h2>
                  <p>Aradığınız ifade birebir bulunamadı. Teknik olarak yakın ürünleri ve ilgili kategorileri gösteriyoruz.</p>
                </div>
              </div>
              <div className="productGrid dense catalogProductGrid">
                {alternatives.items.map((product) => (
                  <ProductCard
                    key={product.slug}
                    href={`/products/${product.slug}`}
                    brand={product.brand}
                    name={product.name}
                    sku={product.sku}
                    category={product.category}
                    image={product.image}
                    stockTone={product.stockTone}
                    stockLabel={product.stockLabel}
                    badges={[...product.badges, product.deliveryEstimate]}
                    isApprovedDealer={Boolean(customer)}
                    price={product.price}
                    listPrice={product.listPrice}
                    discountRate={product.discountRate}
                    priceLabel={product.priceLabel}
                    priceUnavailableMessage={product.priceUnavailableMessage}
                    cartAction={<AddToCartControl slug={product.slug} sku={product.sku} name={product.name} unit={product.unitType} minOrder={product.minOrder} isAuthenticated={Boolean(customer)} />}
                  />
                ))}
              </div>
            </section>
          ) : (
            <EmptyState title="Bu filtrelerle ürün bulunamadı" body="Aramanızı sadeleştirin veya ana katalogdaki tüm aktif ürünlere dönün." action={<a className="btn btnPrimary" href="/catalog">Ana Katalog</a>} />
          )}
          <nav className="pagination" aria-label="Katalog sayfalama">
            <a className={safePage <= 1 ? "disabled" : ""} href={safePage <= 1 ? "#" : pageHref(params, safePage - 1)}>
              Önceki
            </a>
            <span>
              {safePage.toLocaleString("tr-TR")} / {pageCount.toLocaleString("tr-TR")}
            </span>
            <a className={safePage >= pageCount ? "disabled" : ""} href={safePage >= pageCount ? "#" : pageHref(params, safePage + 1)}>
              Sonraki
            </a>
          </nav>
        </div>
      </section>
    </main>
  );
}

function FacetOptions({ id, values }: { id: string; values: string[] }) {
  return <datalist id={id}>{values.map((value) => <option value={value} key={value} />)}</datalist>;
}

function getParam(params: SearchParams, key: string): string {
  const value = params[key];
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}


function pageHref(params: SearchParams, page: number): string {
  const next = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    const scalar = Array.isArray(value) ? value[0] : value;
    if (scalar && key !== "page") {
      next.set(key, scalar);
    }
  }
  next.set("page", String(page));
  return `/catalog?${next.toString()}`;
}
