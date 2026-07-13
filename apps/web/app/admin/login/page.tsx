import { ShieldCheck } from "lucide-react";
import { getAdminEmail } from "../../../lib/admin-auth";
import { getBrandSettings } from "../../../lib/brand-settings";
import { loginAction } from "./actions";

type SearchParams = Record<string, string | string[] | undefined>;

export default async function AdminLoginPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const brandSettings = await getBrandSettings();
  const hasError = Boolean(Array.isArray(params.error) ? params.error[0] : params.error);

  return (
    <main>
      <section className="shell loginLayout">
        <div className="loginCopy">
          <span className="eyebrow dark">Admin girişi</span>
          <h1>Operasyon paneline giriş yapın</h1>
          <p>Import, ürün yayını, stok ve bayi operasyonları için yetkili admin hesabı gerekir.</p>
        </div>
        <form className="loginPanel" action={loginAction}>
          <div className="loginBrand">
            <img src={brandSettings.adminLogoUrl} alt={brandSettings.siteTitle} />
            <div>
              <strong>{brandSettings.siteTitle}</strong>
              <span>{brandSettings.tagline}</span>
            </div>
          </div>
          {hasError ? <div className="formError">E-posta veya şifre hatalı.</div> : null}
          <label>
            E-posta
            <input name="email" type="email" defaultValue={getAdminEmail()} required />
          </label>
          <label>
            Şifre
            <input name="password" type="password" required />
          </label>
          <button className="btn btnPrimary" type="submit">
            <ShieldCheck size={18} aria-hidden="true" />
            Admin Girişi
          </button>
        </form>
      </section>
    </main>
  );
}
