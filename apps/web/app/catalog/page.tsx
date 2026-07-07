import { Filter, Search, SlidersHorizontal } from "lucide-react";
import { EmptyState, ProductCard, StatusPill } from "@entas/ui";
import { getCatalogFacets, getCatalogNavigation, getPricedPublicProducts } from "../../lib/catalog-repository";
import { getCurrentCustomer } from "../../lib/customer-auth";
import type { StockStatus } from "@entas/catalog";

type SearchParams = Record<string, string | string[] | undefined>;

const stockOptions: Array<{ value: StockStatus | "all"; label: string }> = [
  { value: "all", label: "Tümü" },
  { value: "in_stock", label: "Stokta" },
  { value: "low_stock", label: "Az stok" },
  { value: "incoming", label: "Tedarik sürecinde" },
  { value: "out_of_stock", label: "Stok yok" }
];

export const dynamic = "force-dynamic";

export default async function CatalogPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const q = getParam(params, "q");
  const category = getParam(params, "category");
  const group = getParam(params, "group");
  const view = getParam(params, "view");
  const brand = getParam(params, "brand");
  const sourceKey = getParam(params, "sourceKey");
  const stockStatus = toStockStatus(getParam(params, "stockStatus"));
  const page = Math.max(1, Number(getParam(params, "page") || "1"));
  const limit = 24;
  const offset = (page - 1) * limit;

  const customer = await getCurrentCustomer();
  const [facets, navigation, products] = await Promise.all([
    getCatalogFacets(true),
    getCatalogNavigation(),
    getPricedPublicProducts({ q, category, categoryGroup: group, view, brand, sourceKey, stockStatus, limit, offset }, customer)
  ]);
  const safePage = Math.floor(products.offset / products.limit) + 1;
  const pageCount = Math.max(1, Math.ceil(products.total / products.limit));

  return (
    <main className="catalogPage">
      <section className="shell pageIntro compact">
        <div>
          <span className="eyebrow dark">Ürün kataloğu</span>
          <h1>Tüm kategoriler ve teknik ürün listesi</h1>
          <p>{products.total.toLocaleString("tr-TR")} ürün listeleniyor. {customer ? `${customer.companyName} için özel bayi fiyatları uygulanıyor.` : "Fiyat, indirim, sepet ve ödeme aksiyonları yalnızca onaylı bayi hesaplarında açılır."}</p>
        </div>
        <a className="btn btnSecondary" href="/dealer-application">
          Bayi Başvurusu
        </a>
      </section>

      <section className="shell catalogLayout">
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
            <label>
              Stok durumu
              <select name="stockStatus" defaultValue={stockStatus}>
                {stockOptions.map((option) => (
                  <option value={option.value} key={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <button className="btn btnPrimary" type="submit">
              <Search size={17} aria-hidden="true" />
              Filtrele
            </button>
          </form>
          <div className="filterGroup">
            <strong>Hızlı katalog</strong>
            {navigation.slice(0, 12).map((item) => (
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
              <span>Teknik özellik, SKU, barkod ve stok durumuna göre aranabilir.</span>
            </div>
            <a className="btn btnGhost dark" href="/catalog">
              <SlidersHorizontal size={17} aria-hidden="true" />
              Sıfırla
            </a>
          </div>
          <div className="activeFilters">
            <StatusPill tone="info">Stok görünümü: durum bazlı</StatusPill>
            <StatusPill tone={customer ? "success" : "warning"}>{customer ? `Fiyat görünümü: ${customer.segment} bayi` : "Fiyat görünümü: bayi girişi gerekli"}</StatusPill>
            {q ? <StatusPill tone="neutral">Arama: {q}</StatusPill> : null}
            {category ? <StatusPill tone="neutral">Kategori: {category}</StatusPill> : null}
            {group ? <StatusPill tone="neutral">Grup: {products.appliedCategoryLabel ?? group}</StatusPill> : null}
          </div>
          {products.fallback ? <div className="catalogNotice">{products.fallback.message}</div> : null}
          {products.items.length > 0 ? (
            <div className="productGrid dense">
              {products.items.map((product) => (
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
                  isApprovedDealer={Boolean(customer)}
                  price={product.price}
                  listPrice={product.listPrice}
                  discountRate={product.discountRate}
                />
              ))}
            </div>
          ) : (
            <EmptyState
              title="Bu filtrelerle ürün bulunamadı"
              body="Aramanızı sadeleştirin veya ana katalogdaki tüm aktif ürünlere dönün."
              action={
                <a className="btn btnPrimary" href="/catalog">
                  Ana Katalog
                </a>
              }
            />
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

function getParam(params: SearchParams, key: string): string {
  const value = params[key];
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function toStockStatus(value: string): StockStatus | "all" {
  return value === "in_stock" || value === "low_stock" || value === "incoming" || value === "out_of_stock" ? value : "all";
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
