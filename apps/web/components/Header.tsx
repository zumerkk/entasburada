import { Building2, FileText, PhoneCall, ShieldCheck, ShoppingCart, Store, Truck, UserRound } from "lucide-react";
import { loadCustomerCart } from "../lib/cart-repository";
import { getBrandSettings } from "../lib/brand-settings";
import { getCatalogTree } from "../lib/catalog-repository";
import { COMPANY_CONTACT } from "../lib/company-contact";
import { getCurrentCustomer } from "../lib/customer-auth";
import { CartBadge } from "./CartBadge";
import { MegaMenu } from "./MegaMenu";
import { QuoteBadge } from "./QuoteBadge";
import { SearchAutocomplete } from "./SearchAutocomplete";

export async function Header() {
  const [catalogTree, customer, brandSettings] = await Promise.all([getCatalogTree(), getCurrentCustomer(), getBrandSettings()]);
  const cart = customer ? await loadCustomerCart(customer) : null;

  return (
    <header className="siteHeader">
      <div className="topBar">
        <div className="shell topBarInner">
          <a className="topBarShipping" href="/delivery">
            <Truck size={15} aria-hidden="true" />
            <strong>10.000 TL ve üzeri kargo bizden</strong>
          </a>
          <span>Güvenli bayi alışverişi</span>
          <span>Teknik destek</span>
          <a href="/orders">Sipariş takibi</a>
          <a href={customer ? "/quick-order" : "/login?next=/quick-order"}>Hızlı sipariş</a>
          <a href={customer ? "/projects" : "/login?next=/projects"}>Projeler</a>
          <a href={customer?.sellerAccess?.enabled ? "/satici" : customer ? "/account" : "/login"}>{customer ? customer.companyName : "Bayi girişi"}</a>
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
          <SearchAutocomplete />
          <div className="headerActions">
            <a className="supportLink" href={COMPANY_CONTACT.technicalSupportPhoneHref}>
              <PhoneCall size={18} aria-hidden="true" />
              <span>
                Teknik destek
                <strong>{COMPANY_CONTACT.technicalSupportPhone}</strong>
              </span>
            </a>
            <a className="headerIcon" href={customer?.sellerAccess?.enabled ? "/satici" : customer ? "/account" : "/login"} title="Bayi hesabım">
              {customer?.sellerAccess?.enabled ? <Store size={20} aria-hidden="true" /> : <UserRound size={20} aria-hidden="true" />}
            </a>
            <a className="headerIcon quoteIconWrap" href="/quote" title="Teklif listem">
              <QuoteBadge />
              <FileText size={20} aria-hidden="true" />
            </a>
            <a
              className="headerIcon cartIconWrap"
              href={customer ? "/cart" : "/login?next=/cart"}
              aria-label={customer ? `Sepet, ${cart?.items.length ?? 0} ürün satırı` : "Sepet için bayi girişi"}
              title={customer ? `${cart?.items.length ?? 0} sepet satırı` : "Sepet için bayi girişi gerekir"}
            >
              <CartBadge initialCount={cart?.items.length ?? 0} />
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
          <a className="headerIcon" href={customer?.sellerAccess?.enabled ? "/satici" : customer ? "/account" : "/login"} title="Bayi girişi">
            {customer?.sellerAccess?.enabled ? <Store size={20} aria-hidden="true" /> : <ShieldCheck size={20} aria-hidden="true" />}
          </a>
          <a
            className="headerIcon cartIconWrap"
            href={customer ? "/cart" : "/login?next=/cart"}
            aria-label={customer ? `Sepet, ${cart?.items.length ?? 0} ürün satırı` : "Sepet için bayi girişi"}
            title="Sepet"
          >
            <CartBadge initialCount={cart?.items.length ?? 0} />
            <ShoppingCart size={20} aria-hidden="true" />
          </a>
        </div>
      </div>
      <SearchAutocomplete mobile />
    </header>
  );
}
