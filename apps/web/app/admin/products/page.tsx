import { ImageOff, Search, Trash2 } from "lucide-react";
import { StatusPill } from "@entas/ui";
import type { ProductStatus, StockStatus } from "@entas/catalog";
import { requireAdmin } from "../../../lib/admin-auth";
import {
  XML_SYNCED_SOURCE_KEYS,
  formatCatalogMoney,
  getAdminProducts,
  getCatalogFacets
} from "../../../lib/catalog-repository";
import {
  bulkDeleteProductsAction,
  bulkPriceMarkupAction,
  bulkSetStatusAction,
  deleteSingleProductAction,
  publishAllDraftAction,
  publishSelectedAction,
  updateProductAction
} from "../actions";
import { AdminFrame } from "../AdminFrame";
import { AdminBulkSelection } from "./AdminBulkSelection";

type SearchParams = Record<string, string | string[] | undefined>;

const statusOptions: Array<{ value: ProductStatus | "all"; label: string }> = [
  { value: "all", label: "Tüm durumlar" },
  { value: "DRAFT", label: "Taslak" },
  { value: "ACTIVE", label: "Yayında" },
  { value: "PASSIVE", label: "Pasif" }
];

const stockOptions: Array<{ value: StockStatus | "all"; label: string }> = [
  { value: "all", label: "Tüm stoklar" },
  { value: "in_stock", label: "Stokta" },
  { value: "low_stock", label: "Az stok" },
  { value: "incoming", label: "Tedarik sürecinde" },
  { value: "out_of_stock", label: "Stok yok" }
];

interface QuickFilterState {
  status: ProductStatus | "all";
  stockStatus: StockStatus | "all";
  priceState: "all" | "priced" | "zero";
  imageState: "all" | "with" | "without";
}

/**
 * Tek tikla acilan gunluk is kisayollari.
 *
 * `apply` adres cubugunda hangi parametrelerin yazilacagini, `matches` ise
 * kisayolun su an etkin olup olmadigini soyler. Bos deger ("") parametreyi
 * adresten tamamen kaldirir.
 */
const QUICK_FILTERS: Array<{
  id: string;
  label: string;
  apply: Record<string, string>;
  matches: (state: QuickFilterState) => boolean;
}> = [
  {
    id: "zero-price",
    label: "Fiyatı girilmemiş",
    apply: { priceState: "zero", imageState: "", status: "all", stockStatus: "all" },
    matches: (state) => state.priceState === "zero"
  },
  {
    id: "no-image",
    label: "Görseli olmayan",
    apply: { imageState: "without", priceState: "", status: "all", stockStatus: "all" },
    matches: (state) => state.imageState === "without"
  },
  {
    id: "draft",
    label: "Yayına alınmamış",
    apply: { status: "DRAFT", priceState: "", imageState: "", stockStatus: "all" },
    matches: (state) => state.status === "DRAFT"
  },
  {
    id: "out-of-stock",
    label: "Stok yok",
    apply: { stockStatus: "out_of_stock", status: "all", priceState: "", imageState: "" },
    matches: (state) => state.stockStatus === "out_of_stock"
  },
  {
    id: "passive",
    label: "Pasif",
    apply: { status: "PASSIVE", priceState: "", imageState: "", stockStatus: "all" },
    matches: (state) => state.status === "PASSIVE"
  }
];

/** Depolama enum'u ekranda ham gosterilmesin; siparis durumlariyla ayni yaklasim. */
function productStatusLabel(status: ProductStatus): string {
  return status === "ACTIVE" ? "Yayında" : status === "DRAFT" ? "Taslak" : "Pasif";
}

export const dynamic = "force-dynamic";

export default async function AdminProductsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requireAdmin();
  const params = await searchParams;
  const q = getParam(params, "q");
  const status = toStatus(getParam(params, "status"));
  const stockStatus = toStockStatus(getParam(params, "stockStatus"));
  const sourceKey = getParam(params, "sourceKey");
  const brand = getParam(params, "brand");
  const priceState = toPriceState(getParam(params, "priceState"));
  const imageState = toImageState(getParam(params, "imageState"));
  const page = Math.max(1, Number(getParam(params, "page") || "1"));
  const limit = 50;
  const [facets, products] = await Promise.all([
    getCatalogFacets(false),
    getAdminProducts({ q, status, stockStatus, sourceKey, brand, priceState, imageState, limit, offset: (page - 1) * limit })
  ]);
  // Kaynak secilmediyse secim XML'li kaynagi kapsiyor olabilir; secildiyse kesin bilinir.
  const filterTouchesSyncedSource = sourceKey ? XML_SYNCED_SOURCE_KEYS.has(sourceKey) : true;
  const pageCount = Math.max(1, Math.ceil(products.total / products.limit));
  const okMessage = getParam(params, "ok");
  const errorMessage = getParam(params, "error");
  // Düzenleme sonrası aynı filtre/sayfaya dönebilmek için mevcut adres taşınır.
  const returnTo = pageHref(params, page);
  const hasAnyFilter = Boolean(q || brand || sourceKey) || status !== "all" || stockStatus !== "all" || priceState !== "all" || imageState !== "all";

  return (
    <AdminFrame active="products">
      <header className="adminTopbar">
        <div>
          <span>Ürün yönetimi</span>
          <h1>Katalog yayın ve stok kontrolü</h1>
        </div>
        <form action={publishAllDraftAction}>
          <button className="btn btnPrimary" type="submit">
            Tüm taslakları yayına al
          </button>
        </form>
      </header>

      <section className="panel">
        <form className="adminFilterForm" action="/admin/products">
          <label>
            Arama
            <input name="q" defaultValue={q} placeholder="Ürün, SKU, barkod" />
          </label>
          <label>
            Kaynak (PDF / XML)
            <select name="sourceKey" defaultValue={sourceKey}>
              <option value="">Tüm kaynaklar</option>
              {facets.sources.map((source) => (
                <option value={source.key} key={source.key}>
                  {source.name} — {source.count.toLocaleString("tr-TR")} ürün
                  {XML_SYNCED_SOURCE_KEYS.has(source.key) ? " (XML)" : ""}
                </option>
              ))}
            </select>
          </label>
          <label>
            Marka
            <select name="brand" defaultValue={brand}>
              <option value="">Tüm markalar</option>
              {facets.brands.map((name) => (
                <option value={name} key={name}>
                  {name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Durum
            <select name="status" defaultValue={status}>
              {statusOptions.map((option) => (
                <option value={option.value} key={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Stok
            <select name="stockStatus" defaultValue={stockStatus}>
              {stockOptions.map((option) => (
                <option value={option.value} key={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <input type="hidden" name="priceState" value={priceState} />
          <input type="hidden" name="imageState" value={imageState} />
          <button className="btn btnGhost dark" type="submit">
            <Search size={17} aria-hidden="true" />
            Filtrele
          </button>
        </form>
      </section>

      {/* Gunluk isleri tek tikla acan kisayollar: veri kalitesi bosluklarini
          aramak icin her seferinde suzgec doldurmak gerekmesin. */}
      <nav className="adminQuickFilters" aria-label="Hızlı filtreler">
        <span>Hızlı filtreler</span>
        {QUICK_FILTERS.map((filter) => {
          const active = filter.matches({ status, stockStatus, priceState, imageState });
          return (
            <a
              className={active ? "active" : ""}
              href={quickFilterHref(params, filter.apply)}
              key={filter.id}
              aria-current={active ? "true" : undefined}
            >
              {filter.label}
            </a>
          );
        })}
        {hasAnyFilter ? (
          <a className="reset" href="/admin/products">
            Filtreleri temizle
          </a>
        ) : null}
      </nav>

      <form className="panel" action={publishSelectedAction}>
        {/* Toplu islem sunucu tarafinda ayni kumeyi yeniden hesaplayabilsin diye
            mevcut filtre ve donus adresi formda tasinir. */}
        <input type="hidden" name="returnTo" value={returnTo} />
        <input type="hidden" name="f_q" value={q} />
        <input type="hidden" name="f_brand" value={brand} />
        <input type="hidden" name="f_sourceKey" value={sourceKey} />
        <input type="hidden" name="f_status" value={status} />
        <input type="hidden" name="f_stockStatus" value={stockStatus} />
        <input type="hidden" name="f_priceState" value={priceState} />
        <input type="hidden" name="f_imageState" value={imageState} />

        <div className="panelHeader">
          <div>
            <h2>{products.total.toLocaleString("tr-TR")} ürün</h2>
            <p>Admin görünümünde fiyat ve gerçek stok miktarı açıktır.</p>
          </div>
        </div>
        {okMessage ? <p className="formSuccess">{okMessage}</p> : null}
        {errorMessage ? <p className="formError">{errorMessage}</p> : null}

        <AdminBulkSelection
          filteredTotal={products.total}
          pageCount={products.items.length}
          filterTouchesSyncedSource={filterTouchesSyncedSource}
          bulkSetStatusAction={bulkSetStatusAction}
          bulkPriceMarkupAction={bulkPriceMarkupAction}
          bulkDeleteProductsAction={bulkDeleteProductsAction}
        />
        <div className="adminTable">
          <div className="adminTableHead productRows">
            <span>Seç</span>
            <span>Ürün</span>
            <span>Kaynak</span>
            <span>Fiyat</span>
            <span>Stok</span>
            <span>Durum</span>
            <span>Public</span>
          </div>
          {products.items.map((product) => (
            <div key={product.id}>
              <div className="adminTableRow productRows">
                <span>
                  <input name="productId" type="checkbox" value={product.id} />
                </span>
                <span className="adminProductCell">
                  {/* Kucuk gorsel: 9.208 urunluk katalogda dogru satiri bulmanin
                      en hizli yolu isim okumak degil, gorsele bakmak. */}
                  {product.image ? (
                    <img className="adminProductThumb" src={product.image} alt="" loading="lazy" width={44} height={44} />
                  ) : (
                    <span className="adminProductThumb empty" aria-label="Görsel yok" title="Görsel yok">
                      <ImageOff size={16} aria-hidden="true" />
                    </span>
                  )}
                  <span>
                    <strong>{product.name}</strong>
                    <small>
                      {product.sku}
                      {product.brand ? ` · ${product.brand}` : ""}
                      {product.category ? ` · ${product.category}` : ""}
                    </small>
                  </span>
                </span>
                <span>
                  {product.sourceName}
                  {XML_SYNCED_SOURCE_KEYS.has(product.sourceKey) ? <small>XML senkron</small> : null}
                </span>
                <span>{formatCatalogMoney(product.listPrice, product.currency)}</span>
                <span>
                  {product.stockQuantity.toLocaleString("tr-TR")} {product.unitType}
                </span>
                <span>
                  <StatusPill tone={product.status === "ACTIVE" ? "success" : product.status === "DRAFT" ? "warning" : "neutral"}>
                    {productStatusLabel(product.status)}
                  </StatusPill>
                </span>
                <span>
                  {product.isVisible ? (
                    <a className="textLink" href={`/products/${product.slug}`}>
                      Aç
                    </a>
                  ) : (
                    <StatusPill tone="neutral">Kapalı</StatusPill>
                  )}
                </span>
              </div>
              <details className="productEdit">
                <summary>Düzenle</summary>
                <div className="productEditForm">
                  <input type="hidden" name="productId" value={product.id} form={`edit-${product.id}`} />
                  <input type="hidden" name="returnTo" value={returnTo} form={`edit-${product.id}`} />
                  <label>
                    Ürün adı
                    <input name="name" defaultValue={product.name} form={`edit-${product.id}`} />
                  </label>
                  <label>
                    Marka
                    <input name="brand" defaultValue={product.brand} form={`edit-${product.id}`} />
                  </label>
                  <label>
                    Kategori
                    <input name="category" defaultValue={product.category} form={`edit-${product.id}`} />
                  </label>
                  <label>
                    Fiyat
                    <input name="listPrice" defaultValue={product.listPrice} inputMode="decimal" form={`edit-${product.id}`} />
                  </label>
                  <label>
                    Para birimi
                    <select name="currency" defaultValue={product.currency} form={`edit-${product.id}`}>
                      <option value="TRY">TRY</option>
                      <option value="USD">USD</option>
                      <option value="EUR">EUR</option>
                      <option value="GBP">GBP</option>
                    </select>
                  </label>
                  <label>
                    Stok adedi
                    <input name="stockQuantity" type="number" min={0} defaultValue={product.stockQuantity} form={`edit-${product.id}`} />
                  </label>
                  <label>
                    Birim
                    <input name="unitType" defaultValue={product.unitType} form={`edit-${product.id}`} />
                  </label>
                  <label>
                    Durum
                    <select name="status" defaultValue={product.status} form={`edit-${product.id}`}>
                      <option value="ACTIVE">Yayında</option>
                      <option value="DRAFT">Taslak</option>
                      <option value="PASSIVE">Pasif</option>
                    </select>
                  </label>
                  <label>
                    Barkod
                    <input name="barcode" defaultValue={product.barcode ?? ""} form={`edit-${product.id}`} />
                  </label>
                  <label>
                    Üretici kodu
                    <input name="manufacturerCode" defaultValue={product.manufacturerCode ?? ""} form={`edit-${product.id}`} />
                  </label>
                  <label>
                    KDV oranı (%)
                    <input name="taxRate" inputMode="decimal" defaultValue={product.taxRate > 0 ? String(product.taxRate) : ""} form={`edit-${product.id}`} />
                  </label>
                  <label>
                    Min. sipariş adedi
                    <input name="minOrder" type="number" min={0} defaultValue={product.minOrder > 0 ? product.minOrder : ""} form={`edit-${product.id}`} />
                  </label>
                  <label>
                    Paket adedi
                    <input name="packageQuantity" type="number" min={0} defaultValue={product.packageQuantity > 0 ? product.packageQuantity : ""} form={`edit-${product.id}`} />
                  </label>
                  <label>
                    Koli adedi
                    <input name="cartonQuantity" type="number" min={0} defaultValue={product.cartonQuantity > 0 ? product.cartonQuantity : ""} form={`edit-${product.id}`} />
                  </label>
                  <label className="spanTwo">
                    Görsel adresi
                    <input name="imageUrl" defaultValue={product.image ?? ""} form={`edit-${product.id}`} />
                  </label>
                  <label className="spanTwo">
                    Açıklama
                    <textarea name="description" rows={3} defaultValue={product.description ?? ""} form={`edit-${product.id}`} />
                  </label>
                  <label className="checkboxLabel spanTwo">
                    <input type="checkbox" name="isVisible" defaultChecked={product.isVisible} form={`edit-${product.id}`} />
                    Vitrinde görünsün
                  </label>
                  <div className="productEditActions spanTwo">
                    <button className="btn btnPrimary" type="submit" form={`edit-${product.id}`}>
                      Kaydet
                    </button>
                    {/* Tekil silme ayri bir forma bagli: kaydet dugmesiyle ayni
                        formda olsa yanlislikla silme riski dogar. */}
                    <button className="btn btnDanger" type="submit" form={`delete-${product.id}`}>
                      <Trash2 size={16} aria-hidden="true" />
                      Bu ürünü sil
                    </button>
                    <small>Silinen ürün geçmiş siparişleri etkilemez; geri getirmek için kaynağı yeniden içe aktarın.</small>
                  </div>
                </div>
              </details>
            </div>
          ))}
        </div>
      </form>

      <nav className="pagination adminPagination" aria-label="Admin ürün sayfalama">
        <a className={page <= 1 ? "disabled" : ""} href={page <= 1 ? "#" : pageHref(params, page - 1)}>
          Önceki
        </a>
        <span>
          {page.toLocaleString("tr-TR")} / {pageCount.toLocaleString("tr-TR")}
        </span>
        <a className={page >= pageCount ? "disabled" : ""} href={page >= pageCount ? "#" : pageHref(params, page + 1)}>
          Sonraki
        </a>
      </nav>

      {/* Düzenleme formları burada tanımlanır; satırdaki alanlar form="edit-{id}" ile
          bunlara bağlanır. İç içe <form> geçersiz HTML olduğu için bu yöntem kullanılır. */}
      {products.items.map((product) => (
        <form key={`form-${product.id}`} id={`edit-${product.id}`} action={updateProductAction} hidden />
      ))}

      {/* Tekil silme formlari: satirdaki dugme bunlara form="delete-{id}" ile baglanir. */}
      {products.items.map((product) => (
        <form key={`delete-${product.id}`} id={`delete-${product.id}`} action={deleteSingleProductAction} hidden>
          <input type="hidden" name="productId" value={product.id} />
          <input type="hidden" name="returnTo" value={returnTo} />
        </form>
      ))}
    </AdminFrame>
  );
}

function getParam(params: SearchParams, key: string): string {
  const value = params[key];
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function toPriceState(value: string): "all" | "priced" | "zero" {
  return value === "priced" || value === "zero" ? value : "all";
}

function toImageState(value: string): "all" | "with" | "without" {
  return value === "with" || value === "without" ? value : "all";
}

function toStatus(value: string): ProductStatus | "all" {
  return value === "DRAFT" || value === "ACTIVE" || value === "PASSIVE" ? value : "all";
}

function toStockStatus(value: string): StockStatus | "all" {
  return value === "in_stock" || value === "low_stock" || value === "incoming" || value === "out_of_stock" ? value : "all";
}

/** Mevcut adresi koruyup yalnizca kisayolun parametrelerini degistirir; bos deger parametreyi siler. */
function quickFilterHref(params: SearchParams, apply: Record<string, string>): string {
  const next = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    const scalar = Array.isArray(value) ? value[0] : value;
    if (scalar && key !== "page" && key !== "ok" && key !== "error") next.set(key, scalar);
  }
  for (const [key, value] of Object.entries(apply)) {
    if (value && value !== "all") next.set(key, value);
    else next.delete(key);
  }
  const query = next.toString();
  return query ? `/admin/products?${query}` : "/admin/products";
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
  return `/admin/products?${next.toString()}`;
}
