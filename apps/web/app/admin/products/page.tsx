import { Search } from "lucide-react";
import { StatusPill } from "@entas/ui";
import type { ProductStatus, StockStatus } from "@entas/catalog";
import { requireAdmin } from "../../../lib/admin-auth";
import { formatCatalogMoney, getAdminProducts, getCatalogFacets } from "../../../lib/catalog-repository";
import { publishAllDraftAction, publishSelectedAction } from "../actions";
import { AdminFrame } from "../AdminFrame";

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

export const dynamic = "force-dynamic";

export default async function AdminProductsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requireAdmin();
  const params = await searchParams;
  const q = getParam(params, "q");
  const status = toStatus(getParam(params, "status"));
  const stockStatus = toStockStatus(getParam(params, "stockStatus"));
  const sourceKey = getParam(params, "sourceKey");
  const page = Math.max(1, Number(getParam(params, "page") || "1"));
  const limit = 50;
  const [facets, products] = await Promise.all([
    getCatalogFacets(false),
    getAdminProducts({ q, status, stockStatus, sourceKey, limit, offset: (page - 1) * limit })
  ]);
  const pageCount = Math.max(1, Math.ceil(products.total / products.limit));

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
          <button className="btn btnGhost dark" type="submit">
            <Search size={17} aria-hidden="true" />
            Filtrele
          </button>
        </form>
      </section>

      <form className="panel" action={publishSelectedAction}>
        <div className="panelHeader">
          <div>
            <h2>{products.total.toLocaleString("tr-TR")} ürün</h2>
            <p>Admin görünümünde fiyat ve gerçek stok miktarı açıktır.</p>
          </div>
          <button className="btn btnSecondary" type="submit">
            Seçilileri yayına al
          </button>
        </div>
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
            <div className="adminTableRow productRows" key={product.id}>
              <span>
                <input name="productId" type="checkbox" value={product.id} />
              </span>
              <span>
                <strong>{product.name}</strong>
                <small>{product.sku}</small>
              </span>
              <span>{product.sourceName}</span>
              <span>{formatCatalogMoney(product.listPrice, product.currency)}</span>
              <span>
                {product.stockQuantity.toLocaleString("tr-TR")} {product.unitType}
              </span>
              <span>
                <StatusPill tone={product.status === "ACTIVE" ? "success" : product.status === "DRAFT" ? "warning" : "neutral"}>{product.status}</StatusPill>
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
    </AdminFrame>
  );
}

function getParam(params: SearchParams, key: string): string {
  const value = params[key];
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function toStatus(value: string): ProductStatus | "all" {
  return value === "DRAFT" || value === "ACTIVE" || value === "PASSIVE" ? value : "all";
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
  return `/admin/products?${next.toString()}`;
}
