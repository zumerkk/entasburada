import { redirect } from "next/navigation";
import { BarChart3, Boxes, Braces, Database, Download, KeyRound, PackageCheck, Search, ShieldCheck, ShoppingCart, Store, Truck } from "lucide-react";
import { StatusPill } from "@entas/ui";
import { AddToCartControl } from "../../../components/AddToCartControl";
import { requireCustomer } from "../../../lib/customer-auth";
import { getSellerCatalog, type SellerStockFilter } from "../../../lib/reseller-catalog";
import { searchAdminOrders } from "../../../lib/commercial-repository";

type SearchParams = Record<string, string | string[] | undefined>;
const PAGE_SIZE = 30;

export const dynamic = "force-dynamic";

export default async function SellerDashboardPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const customer = await requireCustomer();
  if (!customer.sellerAccess?.enabled) redirect("/account");
  const params = await searchParams;
  const passwordChanged = getParam(params, "passwordChanged") === "1";
  const q = getParam(params, "q");
  const stock = toStockFilter(getParam(params, "stock"));
  const page = Math.max(1, Number(getParam(params, "page") || "1"));
  const [catalog, orders] = await Promise.all([
    getSellerCatalog(customer, { q, stock, limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE }),
    searchAdminOrders({ q: customer.email, limit: 5 })
  ]);
  const safePage = Math.floor(catalog.offset / catalog.limit) + 1;
  const pageCount = Math.max(1, Math.ceil(catalog.total / catalog.limit));
  const access = customer.sellerAccess;
  const dropshipEnabled = access.mode === "dropshipping" || access.mode === "hybrid";

  return (
    <main className="sellerPortal">
      <section className="sellerHero">
        <div className="shell sellerHeroInner">
          <div>
            <span className="sellerEyebrow"><Store size={15} /> Yetkili paneli</span>
            <h1>{customer.companyName}</h1>
            <p>Canlı ürün, KDV dahil satıcı kanal alış fiyatı, stok ve sipariş operasyonunuz tek çalışma alanında.</p>
            <div className="sellerHeroBadges">
              <StatusPill tone="success">{sellerModeLabel(access.mode)}</StatusPill>
              <StatusPill tone={access.exactStockEnabled ? "success" : "info"}>{access.exactStockEnabled ? "Net stok açık" : "Stok aralığı"}</StatusPill>
              <StatusPill tone={access.apiEnabled ? "success" : "neutral"}>{access.apiEnabled ? "API açık" : "API kapalı"}</StatusPill>
            </div>
          </div>
          <aside>
            <span>Önerilen mağaza kârı</span>
            <strong>%{access.defaultMarkupRate.toLocaleString("tr-TR", { maximumFractionDigits: 1 })}</strong>
            <small>Satıcı alış fiyatınızın üzerine eklenerek önerilen mağaza satış fiyatını hesaplar.</small>
          </aside>
        </div>
      </section>

      <nav className="shell sellerQuickNav" aria-label="Yetkili paneli hızlı işlemler">
        <a href="#urunler"><Boxes size={18} /> Ürün ve stok</a>
        <a href="/cart"><ShoppingCart size={18} /> Sepet</a>
        {dropshipEnabled ? <a href="/satici/siparis"><Truck size={18} /> Dropship siparişi</a> : null}
        <a href="/orders"><PackageCheck size={18} /> Sipariş takibi</a>
        <a href="#entegrasyon"><Braces size={18} /> Entegrasyon</a>
      </nav>

      {passwordChanged ? (
        <div className="shell sellerSuccessNotice" role="status">
          <ShieldCheck size={20} aria-hidden="true" />
          <span><strong>Hesabınız güvenle etkinleştirildi.</strong> Kalıcı şifreniz kaydedildi; yetkili panelinin tüm özelliklerini kullanabilirsiniz.</span>
        </div>
      ) : null}

      <section className="shell sellerStats">
        <div><Boxes size={19} /><span>Aktif ürün</span><strong>{catalog.summary.activeProducts.toLocaleString("tr-TR")}</strong><small>Sistemde satışa açık</small></div>
        <div><PackageCheck size={19} /><span>Stokta</span><strong>{catalog.summary.availableProducts.toLocaleString("tr-TR")}</strong><small>Siparişe uygun stok</small></div>
        <div><BarChart3 size={19} /><span>Fiyatlı ürün</span><strong>{catalog.summary.pricedProducts.toLocaleString("tr-TR")}</strong><small>KDV dahil alış fiyatı</small></div>
        <div><Truck size={19} /><span>Toplam sipariş</span><strong>{orders.total.toLocaleString("tr-TR")}</strong><small>Panel ve API siparişleri</small></div>
      </section>

      <section className="shell sellerWorkspace" id="urunler">
        <div className="sellerSectionHead">
          <div><span>Canlı katalog</span><h2>Ürün, fiyat ve stok</h2><p>Veriler katalog yönetimindeki aktif ürünlerden anlık hazırlanır.</p></div>
          <a className="btn btnGhost dark" href="/quick-order">Toplu SKU girişi</a>
        </div>
        <form className="sellerProductFilters" action="/satici/katalog">
          <label><Search size={17} /><input name="q" defaultValue={q} placeholder="SKU, barkod, ürün, marka…" /></label>
          <select name="stock" defaultValue={stock} aria-label="Stok filtresi">
            <option value="all">Tüm stok durumları</option>
            <option value="available">Siparişe uygun</option>
            <option value="low_stock">Az stok</option>
            <option value="incoming">Tedarik sürecinde</option>
            <option value="out_of_stock">Stok yok</option>
          </select>
          <button className="btn btnPrimary" type="submit">Filtrele</button>
          <a className="btn btnGhost dark" href="/satici/katalog">Temizle</a>
        </form>

        <div className="sellerProductTable">
          <div className="sellerProductTableHead"><span>Ürün</span><span>Stok</span><span>Satıcı alış fiyatı</span><span>Önerilen mağaza satışı</span><span>Sipariş</span></div>
          {catalog.items.map((product) => (
            <div className="sellerProductRow" key={product.productUrl}>
              <span className="sellerProductIdentity">
                <img src={product.imageUrl} alt="" loading="lazy" />
                <span><strong><a href={product.productUrl}>{product.name}</a></strong><small>{product.brand} · {product.sku} · {product.unit}</small></span>
              </span>
              <span className="sellerStockCell">
                <StatusPill tone={stockTone(product.stockStatus)}>{product.stockLabel}</StatusPill>
                <small>{product.exactStock ? `${product.availableQuantity?.toLocaleString("tr-TR") ?? 0} ${product.unit}` : product.stockRange}</small>
              </span>
              <span className="sellerPriceCell"><strong>{product.displayPurchasePrice ?? "Teklif alın"}</strong><small>KDV dahil</small></span>
              <span className="sellerPriceCell"><strong>{product.displayRecommendedSalePrice ?? "—"}</strong><small>{product.estimatedProfit ? `Tahmini kâr ${product.estimatedProfit} ${product.currency}` : "Fiyat bekleniyor"}</small></span>
              <span>
                {product.orderable ? <AddToCartControl slug={product.productUrl.split("/products/")[1] ?? ""} sku={product.sku} name={product.name} unit={product.unit} minOrder={product.minOrder} isAuthenticated /> : <small className="sellerNotOrderable">Stok/fiyat teyidi gerekli</small>}
              </span>
            </div>
          ))}
          {catalog.items.length === 0 ? <div className="sellerEmpty">Bu filtrelerle ürün bulunamadı.</div> : null}
        </div>
        <nav className="pagination" aria-label="Satıcı kataloğu sayfalama">
          <a className={safePage <= 1 ? "disabled" : ""} href={safePage <= 1 ? "#" : pageHref(params, safePage - 1)}>Önceki</a>
          <span>{safePage.toLocaleString("tr-TR")} / {pageCount.toLocaleString("tr-TR")}</span>
          <a className={safePage >= pageCount ? "disabled" : ""} href={safePage >= pageCount ? "#" : pageHref(params, safePage + 1)}>Sonraki</a>
        </nav>
      </section>

      <section className="shell sellerIntegration" id="entegrasyon">
        <div className="sellerSectionHead">
          <div><span>Veri aktarımı</span><h2>Mağazanızı ENTAŞBURADA’ya bağlayın</h2><p>JSON API, CSV ve XML aynı aktif ürün, fiyat ve stok politikasını kullanır.</p></div>
          <Database size={28} />
        </div>
        {access.productFeedEnabled ? (
          <div className="sellerIntegrationGrid">
            <a href="/api/reseller/v1/products?format=csv"><Download size={20} /><strong>CSV ürün listesi</strong><span>Excel ve toplu içe aktarma için UTF-8 dosya</span></a>
            <a href="/api/reseller/v1/products?format=xml"><Download size={20} /><strong>XML ürün beslemesi</strong><span>Pazaryeri ve e-ticaret yazılımları için</span></a>
            <a href="/api/reseller/v1/products?format=json&limit=100"><Braces size={20} /><strong>JSON API önizleme</strong><span>Sayfalı ürün, fiyat ve stok yanıtı</span></a>
          </div>
        ) : <p className="sellerNotice">Ürün beslemesi bu hesap için kapalı. Yöneticinizle iletişime geçin.</p>}
        {access.apiEnabled ? (
          <div className="sellerApiCard">
            <div><KeyRound size={20} /><span><strong>Bearer API erişimi</strong><small>{access.apiKeyPrefix ? `Anahtar kimliği: ${access.apiKeyPrefix}…` : "Admin henüz API anahtarı üretmedi."}</small></span></div>
            <pre><code>{`curl -H "Authorization: Bearer $ENTAS_API_KEY" \\\n  "https://entasburada.com/api/reseller/v1/products?stock=available&limit=100"`}</code></pre>
            <p>Güvenlik için API anahtarının tamamı panelde gösterilmez. Anahtarı sunucu ortam değişkeninde saklayın; tarayıcı koduna koymayın.</p>
          </div>
        ) : null}
      </section>
    </main>
  );
}

function getParam(params: SearchParams, key: string): string { const value = params[key]; return Array.isArray(value) ? value[0] ?? "" : value ?? ""; }
function toStockFilter(value: string): SellerStockFilter { return (["available", "low_stock", "incoming", "out_of_stock"] as string[]).includes(value) ? value as SellerStockFilter : "all"; }
function pageHref(params: SearchParams, page: number): string { const query = new URLSearchParams(); for (const [key, value] of Object.entries(params)) { if (key === "page" || value == null) continue; query.set(key, Array.isArray(value) ? value[0] ?? "" : value); } query.set("page", String(page)); return `/satici/katalog?${query.toString()}`; }
function sellerModeLabel(mode: string): string { return mode === "dropshipping" ? "Dropshipping" : mode === "hybrid" ? "Al-sat + Dropshipping" : "Al-sat bayi"; }
function stockTone(status: string): "success" | "warning" | "danger" | "info" { return status === "in_stock" ? "success" : status === "low_stock" || status === "incoming" ? "warning" : "danger"; }
