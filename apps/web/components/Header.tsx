import { Building2, FileText, Menu, PhoneCall, Search, ShieldCheck, ShoppingCart, UserRound } from "lucide-react";
import { loadCustomerCart } from "../lib/cart-repository";
import { getBrandSettings } from "../lib/brand-settings";
import { getCatalogTree } from "../lib/catalog-repository";
import { COMPANY_CONTACT } from "../lib/company-contact";
import { getCurrentCustomer } from "../lib/customer-auth";
import { MegaMenu } from "./MegaMenu";

export async function Header() {
  const [catalogTree, customer, brandSettings] = await Promise.all([getCatalogTree(), getCurrentCustomer(), getBrandSettings()]);
  const cart = customer ? await loadCustomerCart(customer) : null;

  return (
    <header className="siteHeader">
      <div className="topBar">
        <div className="shell topBarInner">
          <span>Hızlı teslimat</span>
          <span>Güvenli bayi alışverişi</span>
          <span>Teknik destek</span>
          <a href="/orders">Sipariş takibi</a>
          <a href={customer ? "/quick-order" : "/login?next=/quick-order"}>Hızlı sipariş</a>
          <a href={customer ? "/account" : "/login"}>{customer ? customer.companyName : "Bayi girişi"}</a>
          <a href="/dealer-application">Bayi başvurusu</a>
        </div>
      </div>
      <div className="mainHeader">
        <div className="shell mainHeaderInner">
          <a className="brand" href="/" aria-label="ENTAŞBURADA ana sayfa">
            <span className="brandLogoFrame">
              <img className="brandLogo" src={brandSettings.headerLogoUrl} alt="" />
            </span>
            <span>
              {brandSettings.siteTitle}
              <small>{brandSettings.tagline}</small>
            </span>
          </a>
          <a className="catalogCta" href="/catalog">
            Ana Katalog
          </a>
          <form className="searchBox" action="/catalog">
            <button type="button" className="categoryButton">
              <Menu size={18} aria-hidden="true" />
              Kategori
            </button>
            <label className="srOnly" htmlFor="site-search">
              Ürün, SKU, barkod veya teknik özellik ara
            </label>
            <input id="site-search" name="q" type="search" placeholder="Ürün, SKU, barkod, marka veya teknik özellik ara" />
            <button type="submit" className="searchButton" aria-label="Ara">
              <Search size={20} aria-hidden="true" />
            </button>
          </form>
          <div className="headerActions">
            <a className="supportLink" href={COMPANY_CONTACT.technicalSupportPhoneHref}>
              <PhoneCall size={18} aria-hidden="true" />
              <span>
                Teknik destek
                <strong>{COMPANY_CONTACT.technicalSupportPhone}</strong>
              </span>
            </a>
            <a className="headerIcon" href={customer ? "/account" : "/login"} title="Bayi hesabım">
              <UserRound size={20} aria-hidden="true" />
            </a>
            <a className="headerIcon" href="/quote" title="Teklif listem">
              <FileText size={20} aria-hidden="true" />
            </a>
            <a className="headerIcon" href={customer ? "/cart" : "/login"} title={customer ? `${cart?.items.length ?? 0} sepet satırı` : "Sepet için bayi girişi gerekir"}>
              <ShoppingCart size={20} aria-hidden="true" />
            </a>
          </div>
        </div>
      </div>
      <MegaMenu tree={catalogTree} />
      <div className="mobileHeader">
        <a className="brand compact" href="/">
          <span className="brandLogoFrame">
            <img className="brandLogo" src={brandSettings.mobileLogoUrl} alt="" />
          </span>
          <span>{brandSettings.siteTitle}</span>
        </a>
        <div className="mobileHeaderActions">
          <a className="mobileCatalogLink" href="/catalog">
            Ana Katalog
          </a>
          <a className="mobileCatalogLink" href={customer ? "/quick-order" : "/login?next=/quick-order"}>
            Hızlı Sipariş
          </a>
          <a className="headerIcon" href="/dealer-application" title="Bayi başvurusu">
            <Building2 size={20} aria-hidden="true" />
          </a>
          <a className="headerIcon" href={customer ? "/account" : "/login"} title="Bayi girişi">
            <ShieldCheck size={20} aria-hidden="true" />
          </a>
        </div>
      </div>
      <form className="mobileSearch" action="/catalog">
        <input name="q" type="search" placeholder="SKU, barkod veya ürün ara" />
        <button type="submit" aria-label="Ara">
          <Search size={18} aria-hidden="true" />
        </button>
      </form>
    </header>
  );
}
