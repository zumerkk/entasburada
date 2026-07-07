import { ShieldCheck } from "lucide-react";
import { customerLoginAction } from "./actions";

type SearchParams = Record<string, string | string[] | undefined>;

export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const error = getParam(params, "error");
  const next = getParam(params, "next");

  return (
    <main>
      <section className="shell loginLayout">
        <div className="loginCopy">
          <span className="eyebrow dark">Bayi girişi</span>
          <h1>Onaylı bayi hesabınızla devam edin</h1>
          <p>
            Fiyatlar, iskonto, sepet, vadeli ödeme ve teslimat avantajları yalnızca onaylı bayi oturumunda görünür.
          </p>
          <div className="testAccountList">
            <strong>Test bayi hesapları</strong>
            <span>bayi1@entasburada.com / Bayi2026!</span>
            <span>sanayi@entasburada.com / Sanayi2026!</span>
            <span>proje@entasburada.com / Proje2026!</span>
          </div>
        </div>
        <form className="loginPanel" action={customerLoginAction}>
          {error ? <div className="formError">{error}</div> : null}
          <input type="hidden" name="next" value={next} />
          <label>
            E-posta
            <input name="email" type="email" required />
          </label>
          <label>
            Şifre
            <input name="password" type="password" required />
          </label>
          <button className="btn btnPrimary" type="submit">
            <ShieldCheck size={18} aria-hidden="true" />
            Bayi Girişi
          </button>
          <a href="/dealer-application">Bayi hesabınız yok mu?</a>
          <a href="/password-reset">Şifremi unuttum</a>
        </form>
      </section>
    </main>
  );
}

function getParam(params: SearchParams, key: string): string {
  const value = params[key];
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}
