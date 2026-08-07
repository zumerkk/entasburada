import { Building2, KeyRound, Mail, MapPin, PhoneCall } from "lucide-react";
import { EmptyState, StatusPill } from "@entas/ui";
import { requireAdmin } from "../../../lib/admin-auth";
import {
  dealerApplicationStatusLabel,
  listDealerApplications,
  type DealerApplicationStatus
} from "../../../lib/dealer-application-repository";
import { getCustomers, type CustomerSegment } from "../../../lib/customer-auth";
import {
  createManualDealerApplicationAction,
  updateDealerAccountAction,
  updateDealerApplicationStatusAction
} from "../actions";
import { AdminFrame } from "../AdminFrame";

type SearchParams = Record<string, string | string[] | undefined>;

const statusFilters: Array<DealerApplicationStatus | "all"> = ["all", "pending", "reviewing", "approved", "rejected"];

const statusTone: Record<DealerApplicationStatus, "success" | "warning" | "danger" | "info" | "neutral"> = {
  pending: "warning",
  reviewing: "info",
  approved: "success",
  rejected: "danger"
};

export const dynamic = "force-dynamic";

export default async function AdminDealersPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requireAdmin();
  const params = await searchParams;
  const status = (getParam(params, "status") || "all") as DealerApplicationStatus | "all";
  const q = getParam(params, "q");
  const highlight = getParam(params, "highlight");
  const okMessage = getParam(params, "ok");
  const errorMessage = getParam(params, "error");
  const [applications, customers] = await Promise.all([listDealerApplications({ status, q }), getCustomers()]);
  const accountTerm = q.trim().toLocaleLowerCase("tr-TR");
  const visibleCustomers = customers.filter((customer) =>
    accountTerm
      ? [customer.companyName, customer.authorizedPerson, customer.email, customer.phone, customer.city]
          .some((value) => value.toLocaleLowerCase("tr-TR").includes(accountTerm))
      : true
  );

  return (
    <AdminFrame active="dealers">
      <header className="adminTopbar">
        <div>
          <span>Bayiler</span>
          <h1>Bayi yönetimi</h1>
        </div>
      </header>

      <section className="panel">
        <form className="adminFilterForm" action="/admin/dealers">
          <label>
            Arama
            <input name="q" defaultValue={q} placeholder="Firma, yetkili, e-posta, vergi no, il" />
          </label>
          <label>
            Durum
            <select name="status" defaultValue={status}>
              {statusFilters.map((value) => (
                <option key={value} value={value}>
                  {value === "all" ? "Tümü" : dealerApplicationStatusLabel(value)}
                </option>
              ))}
            </select>
          </label>
          <button className="btn btnPrimary" type="submit">
            Filtrele
          </button>
        </form>
      </section>

      <section className="panel">
        <div className="panelHeader compact">
          <div>
            <h2>{visibleCustomers.length.toLocaleString("tr-TR")} bayi hesabı</h2>
            <small>Onaylı hesaplar, fiyat segmentleri ve iletişim bilgileri</small>
          </div>
        </div>
        {visibleCustomers.length === 0 ? (
          <EmptyState title="Bayi hesabı bulunamadı" body="Aramanızla eşleşen kayıtlı bayi hesabı yok." />
        ) : (
          <div className="adminTable">
            <div className="adminTableHead dealerAccountRows">
              <span>Firma</span>
              <span>İletişim</span>
              <span>Konum</span>
              <span>Segment</span>
              <span>İskonto</span>
              <span>Durum</span>
            </div>
            {visibleCustomers.map((customer) => (
              <div key={customer.id}>
                <div className="adminTableRow dealerAccountRows">
                  <span>
                    <strong>{customer.companyName}</strong>
                    <small>{customer.authorizedPerson}</small>
                  </span>
                  <span>
                    <strong>{customer.email}</strong>
                    <small>{customer.phone}</small>
                  </span>
                  <span>
                    <strong>{customer.city}</strong>
                    <small>{customer.deliveryAddress}</small>
                  </span>
                  <span>
                    <strong>{customer.tierName ?? segmentLabel(customer.segment)}</strong>
                    <small>{customer.tierRank ?? segmentLabel(customer.segment)}</small>
                  </span>
                  <strong>%{customer.baseDiscountRate}</strong>
                  <StatusPill tone={customer.status === "approved" ? "success" : customer.status === "suspended" ? "danger" : "warning"}>
                    {customer.status === "approved" ? "Aktif" : customer.status === "suspended" ? "Askıda" : "Beklemede"}
                  </StatusPill>
                </div>
                <details className="dealerEdit">
                  <summary>Bayiyi düzenle</summary>
                  <form action={updateDealerAccountAction} className="adminFilterForm inlineCommercialForm">
                    <input type="hidden" name="customerId" value={customer.id} />
                    <label>
                      Firma adı
                      <input name="companyName" defaultValue={customer.companyName} />
                    </label>
                    <label>
                      Yetkili kişi
                      <input name="authorizedPerson" defaultValue={customer.authorizedPerson} />
                    </label>
                    <label>
                      Segment / kademe
                      <select name="segment" defaultValue={customer.segment}>
                        <option value="standard">Standart Bayi (Bronz)</option>
                        <option value="industrial">Sanayi Pro (Gümüş)</option>
                        <option value="project">Kurumsal Proje (Platin) — en üst</option>
                      </select>
                    </label>
                    <button className="btn btnPrimary" type="submit">
                      Kaydet
                    </button>
                  </form>
                </details>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="panel">
        <div className="panelHeader compact">
          <h2>{applications.length.toLocaleString("tr-TR")} başvuru</h2>
        </div>

        {okMessage ? <p className="formSuccess">{okMessage}</p> : null}
        {errorMessage ? <p className="formError">{errorMessage}</p> : null}

        <details className="manualApplication">
          <summary>Elden alınan başvuruyu ekle</summary>
          <form action={createManualDealerApplicationAction} className="adminFilterForm inlineCommercialForm">
            <label>
              Firma ünvanı *
              <input name="companyTitle" required />
            </label>
            <label>
              Yetkili kişi *
              <input name="authorizedPerson" required />
            </label>
            <label>
              Telefon *
              <input name="phone" type="tel" required placeholder="+90 5xx xxx xx xx" />
            </label>
            <label>
              E-posta *
              <input name="email" type="email" required />
            </label>
            <label>
              Vergi dairesi
              <input name="taxOffice" required minLength={2} maxLength={100} />
            </label>
            <label>
              Vergi no
              <input name="taxNumber" required inputMode="numeric" pattern="[0-9]{10,11}" maxLength={11} />
            </label>
            <label>
              MERSİS no
              <input name="mersisNumber" />
            </label>
            <label>
              Firma tipi
              <select name="companyType" defaultValue="Hırdavat bayisi">
                <option>Hırdavat bayisi</option>
                <option>Yapı market</option>
                <option>Sanayi işletmesi</option>
                <option>Kurumsal satın alma</option>
              </select>
            </label>
            <label>
              İl
              <input name="city" required minLength={2} maxLength={80} />
            </label>
            <label>
              İlçe
              <input name="district" required minLength={2} maxLength={80} />
            </label>
            <label>
              Faaliyet alanı
              <input name="activityArea" defaultValue="Hırdavat" />
            </label>
            <label>
              Bayilik türü
              <select name="dealershipType" defaultValue="Standart bayi">
                <option>Standart bayi</option>
                <option>Bölgesel bayi</option>
                <option>Proje bazlı</option>
                <option>Toptan ticaret</option>
              </select>
            </label>
            <label className="spanTwo">
              Fatura adresi
              <textarea name="invoiceAddress" rows={2} required minLength={10} maxLength={600} />
            </label>
            <label className="spanTwo">
              Teslimat adresi (boş bırakılırsa fatura adresi kullanılır)
              <textarea name="deliveryAddress" rows={2} />
            </label>
            <label className="checkboxLabel spanTwo">
              <input type="checkbox" name="kvkkAccepted" />
              Müşteriden KVKK aydınlatma onayı alındı *
            </label>
            <label className="checkboxLabel spanTwo">
              <input type="checkbox" name="commercialConsent" />
              Ticari elektronik ileti izni alındı
            </label>
            <button className="btn btnPrimary" type="submit">
              Başvuruyu Kaydet (onay bekler)
            </button>
          </form>
        </details>

        {applications.length === 0 ? (
          <EmptyState
            title="Başvuru bulunamadı"
            body="Seçtiğiniz filtreye uygun bayi başvurusu yok. Yeni başvurular müşteri sitesindeki /dealer-application formundan buraya düşer."
          />
        ) : (
          <div className="dealerApplicationList">
            {applications.map((application) => (
              <article
                className={`dealerApplicationCard${highlight === application.id ? " highlight" : ""}`}
                key={application.id}
              >
                <div className="dealerApplicationHead">
                  <div>
                    <h3>{application.companyTitle}</h3>
                    <small>
                      {application.reference} · {new Date(application.createdAt).toLocaleString("tr-TR")}
                    </small>
                  </div>
                  <StatusPill tone={statusTone[application.status]}>
                    {dealerApplicationStatusLabel(application.status)}
                  </StatusPill>
                </div>

                <div className="dealerApplicationGrid">
                  <span>
                    <Building2 size={15} aria-hidden="true" />
                    {application.companyType} · V.D. {application.taxOffice} · VKN {application.taxNumber}
                  </span>
                  <span>
                    <PhoneCall size={15} aria-hidden="true" />
                    {application.authorizedPerson} · {application.phone}
                    {application.whatsapp ? ` · WA ${application.whatsapp}` : ""}
                  </span>
                  <span>
                    <Mail size={15} aria-hidden="true" />
                    {application.email}
                  </span>
                  <span>
                    <MapPin size={15} aria-hidden="true" />
                    {application.city} / {application.district} · {application.activityArea}
                  </span>
                </div>

                <div className="dealerApplicationDetail">
                  <div>
                    <strong>Fatura adresi</strong>
                    <p>{application.invoiceAddress}</p>
                  </div>
                  <div>
                    <strong>Teslimat adresi</strong>
                    <p>{application.deliveryAddress}</p>
                  </div>
                  <div>
                    <strong>Ticari profil</strong>
                    <p>
                      {[application.dealershipType, application.annualPurchaseVolume, application.referenceCompany]
                        .filter(Boolean)
                        .join(" · ") || "—"}
                    </p>
                  </div>
                  <div>
                    <strong>İzinler</strong>
                    <p>
                      KVKK: {application.kvkkAccepted ? "Evet" : "Hayır"} · Ticari ileti:{" "}
                      {application.commercialConsent ? "Evet" : "Hayır"}
                    </p>
                  </div>
                </div>

                {application.reviewNote ? <p className="dealerApplicationNote">Not: {application.reviewNote}</p> : null}

                {application.accountId ? (
                  <div className="dealerCredentials">
                    <div className="dealerCredentialsHead">
                      <KeyRound size={15} aria-hidden="true" />
                      Bayi hesabı hazır
                      {application.welcomeMailSent ? <StatusPill tone="success">E-posta gönderildi</StatusPill> : <StatusPill tone="warning">E-posta gönderilmedi</StatusPill>}
                    </div>
                    <code>Kullanıcı: {application.accountEmail}</code>
                    <p>Geçici parola güvenlik nedeniyle panelde saklanmaz veya gösterilmez. Kullanıcı ilk girişte parolasını değiştirmek zorundadır.</p>
                  </div>
                ) : null}

                <form className="dealerApplicationActions" action={updateDealerApplicationStatusAction}>
                  <input type="hidden" name="applicationId" value={application.id} />
                  <input name="reviewNote" placeholder="İnceleme notu (opsiyonel)" defaultValue="" />
                  <div className="dealerApplicationButtons">
                    <button className="btn btnGhost dark" name="status" value="reviewing" type="submit">
                      İncelemeye Al
                    </button>
                    <button className="btn btnPrimary" name="status" value="approved" type="submit">
                      Onayla
                    </button>
                    <button className="btn btnDanger" name="status" value="rejected" type="submit">
                      Reddet
                    </button>
                  </div>
                </form>
              </article>
            ))}
          </div>
        )}
      </section>
    </AdminFrame>
  );
}

function getParam(params: SearchParams, key: string): string {
  const value = params[key];
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

function segmentLabel(segment: CustomerSegment): string {
  if (segment === "industrial") return "Sanayi";
  if (segment === "project") return "Proje";
  return "Standart bayi";
}
