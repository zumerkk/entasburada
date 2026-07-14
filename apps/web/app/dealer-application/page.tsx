import { Building2, CheckCircle2, FileText, ShieldCheck } from "lucide-react";
import { submitDealerApplicationAction } from "./actions";

type SearchParams = Record<string, string | string[] | undefined>;

function getParam(params: SearchParams, key: string): string {
  const value = params[key];
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

export const dynamic = "force-dynamic";

export default async function DealerApplicationPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const submittedReference = getParam(params, "submitted");
  const errorMessage = getParam(params, "error");

  if (submittedReference) {
    return (
      <main>
        <section className="shell pageIntro">
          <div>
            <span className="eyebrow dark">Başvuru alındı</span>
            <h1>Bayi başvurunuz bize ulaştı</h1>
            <p>
              Başvuru numaranız <strong>{submittedReference}</strong>. Ekibimiz firma bilgilerinizi inceledikten sonra
              bayi kodu, fiyat grubu, iskonto grubu, vade ve satış temsilcisi ataması yaparak sizinle iletişime geçer.
            </p>
          </div>
          <div className="introChecklist">
            <span>
              <CheckCircle2 size={18} aria-hidden="true" />
              Başvuru kaydınız oluşturuldu
            </span>
            <span>
              <ShieldCheck size={18} aria-hidden="true" />
              İnceleme sonrası bilgilendirileceksiniz
            </span>
          </div>
        </section>
        <section className="shell formLayout">
          <div className="formActions">
            <a className="btn btnPrimary" href="/catalog">
              <Building2 size={18} aria-hidden="true" />
              Kataloğu İncele
            </a>
            <a className="btn btnGhost dark" href="/">
              Ana sayfaya dön
            </a>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main>
      <section className="shell pageIntro">
        <div>
          <span className="eyebrow dark">Bayi başvurusu</span>
          <h1>Onaylı bayi hesabı oluşturun</h1>
          <p>
            Başvurunuz incelendikten sonra bayi kodu, fiyat grubu, iskonto grubu, vade ve satış temsilcisi
            ataması yapılır.
          </p>
        </div>
        <div className="introChecklist">
          <span>
            <ShieldCheck size={18} aria-hidden="true" />
            Fiyatlar onaydan sonra açılır
          </span>
          <span>
            <CheckCircle2 size={18} aria-hidden="true" />
            KVKK ve ticari ileti izinleri
          </span>
          <span>
            <FileText size={18} aria-hidden="true" />
            Belgeler ön onaydan sonra istenir
          </span>
        </div>
      </section>

      <section className="shell formLayout">
        {errorMessage ? (
          <p className="formError" role="alert">
            Lütfen zorunlu alanları tamamlayın: {errorMessage}
          </p>
        ) : null}
        <form className="applicationForm" action={submitDealerApplicationAction}>
          <fieldset>
            <legend>Firma bilgileri</legend>
            <label>
              Firma ünvanı
              <input name="companyTitle" required />
            </label>
            <label>
              Vergi dairesi
              <input name="taxOffice" required />
            </label>
            <label>
              Vergi numarası
              <input name="taxNumber" inputMode="numeric" required />
            </label>
            <label>
              Ticaret sicil numarası
              <input name="tradeRegistryNumber" />
            </label>
            <label>
              MERSİS numarası
              <input name="mersisNumber" />
            </label>
            <label>
              Firma tipi
              <select name="companyType" required>
                <option>Hırdavat bayisi</option>
                <option>Yapı market</option>
                <option>Sanayi işletmesi</option>
                <option>Kurumsal satın alma</option>
              </select>
            </label>
          </fieldset>

          <fieldset>
            <legend>Yetkili ve adres</legend>
            <label>
              Yetkili kişi
              <input name="authorizedPerson" required />
            </label>
            <label>
              Telefon
              <input name="phone" type="tel" required />
            </label>
            <label>
              WhatsApp
              <input name="whatsapp" type="tel" />
            </label>
            <label>
              E-posta
              <input name="email" type="email" required />
            </label>
            <label className="spanTwo">
              Fatura adresi
              <textarea name="invoiceAddress" required />
            </label>
            <label className="spanTwo">
              Teslimat adresi
              <textarea name="deliveryAddress" required />
            </label>
          </fieldset>

          <fieldset>
            <legend>Ticari profil</legend>
            <label>
              İl
              <input name="city" required />
            </label>
            <label>
              İlçe
              <input name="district" required />
            </label>
            <label>
              Faaliyet alanı
              <input name="activityArea" required />
            </label>
            <label>
              Yıllık tahmini satın alma hacmi
              <select name="annualPurchaseVolume">
                <option value="">Seçiniz</option>
                <option>0-500.000 TL</option>
                <option>500.000-2.000.000 TL</option>
                <option>2.000.000 TL+</option>
              </select>
            </label>
            <label>
              Bayilik türü
              <select name="dealershipType">
                <option>Standart bayi</option>
                <option>Bölgesel bayi</option>
                <option>Proje bazlı</option>
                <option>Toptan ticaret</option>
              </select>
            </label>
            <label>
              Referans firma
              <input name="referenceCompany" />
            </label>
          </fieldset>

          <fieldset>
            <legend>Onaylar</legend>
            <p className="fieldNote spanTwo">
              Vergi levhası, imza sirküleri ve ticaret odası belgeleri, başvurunuz ön onaydan geçtikten sonra
              satış temsilciniz tarafından e-posta veya WhatsApp üzerinden talep edilir.
            </p>
            <label className="checkLabel">
              <input name="kvkkAccepted" type="checkbox" required />
              KVKK aydınlatma metnini okudum ve kabul ediyorum.
            </label>
            <label className="checkLabel">
              <input name="commercialConsent" type="checkbox" />
              Ticari elektronik ileti gönderimini kabul ediyorum.
            </label>
          </fieldset>

          <div className="formActions">
            <button className="btn btnPrimary" type="submit">
              <Building2 size={18} aria-hidden="true" />
              Başvuruyu Gönder
            </button>
          </div>
        </form>
      </section>
    </main>
  );
}
