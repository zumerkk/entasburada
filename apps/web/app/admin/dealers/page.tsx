import { Building2, Mail, MapPin, PhoneCall } from "lucide-react";
import { EmptyState, StatusPill } from "@entas/ui";
import { requireAdmin } from "../../../lib/admin-auth";
import {
  dealerApplicationStatusLabel,
  listDealerApplications,
  type DealerApplicationStatus
} from "../../../lib/dealer-application-repository";
import { updateDealerApplicationStatusAction } from "../actions";
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
  const applications = await listDealerApplications({ status, q });

  return (
    <AdminFrame active="dealers">
      <header className="adminTopbar">
        <div>
          <span>Bayiler</span>
          <h1>Bayi başvuruları</h1>
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
          <h2>{applications.length.toLocaleString("tr-TR")} başvuru</h2>
        </div>

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
