import { BadgeCheck, MailPlus, ShieldCheck, UsersRound } from "lucide-react";
import { StatusPill } from "@entas/ui";
import { canApproveCompanyOrders, getCompanyMembers, requireCustomer } from "../../../lib/customer-auth";
import { inviteCompanyMemberAction } from "./actions";

export const dynamic = "force-dynamic";
type SearchParams = Record<string, string | string[] | undefined>;

export default async function CompanyTeamPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const customer = await requireCustomer();
  const [members, query] = await Promise.all([getCompanyMembers(customer), searchParams]);
  const canManage = canApproveCompanyOrders(customer);
  return (
    <main>
      <section className="shell pageIntro compact"><div><span className="eyebrow dark">Firma yönetimi</span><h1>{customer.companyName} kullanıcıları</h1><p>Satın alma, finans ve onay rollerini yönetin; kullanıcı bazında sipariş limiti belirleyin.</p></div><a className="btn btnGhost dark" href="/account/approvals"><BadgeCheck size={17} /> Bekleyen Onaylar</a></section>
      <section className="shell teamWorkspace">
        {param(query, "ok") ? <div className="cartAlert success">{param(query, "ok")}</div> : null}
        {param(query, "error") ? <div className="cartAlert danger">{param(query, "error")}</div> : null}
        <div className="teamLayout">
          <article className="panel">
            <div className="panelHeader"><div><h2>Firma kullanıcıları</h2><p>{members.length} aktif hesap</p></div><UsersRound size={21} /></div>
            <div className="companyMemberList">{members.map((member) => <div key={member.id}><span className="memberAvatar">{member.authorizedPerson.slice(0, 1).toUpperCase()}</span><span><strong>{member.authorizedPerson}</strong><small>{member.email} · {roleLabel(member.companyRole)}</small></span><span><StatusPill tone={member.id === customer.id ? "success" : "neutral"}>{member.id === customer.id ? "Siz" : member.status}</StatusPill><small>Limit {money(member.approvalLimit)}</small></span></div>)}</div>
          </article>
          <article className="panel teamInvitePanel">
            <div className="panelHeader"><div><h2>Yeni kullanıcı davet et</h2><p>Geçici giriş bilgisi e-posta ile gönderilir.</p></div><MailPlus size={21} /></div>
            {canManage ? <form action={inviteCompanyMemberAction} className="teamInviteForm">
              <label>Ad soyad<input name="authorizedPerson" required /></label><label>E-posta<input name="email" type="email" required /></label><label>Telefon<input name="phone" type="tel" /></label>
              <label>Firma rolü<select name="companyRole" defaultValue="PURCHASE_STAFF"><option value="PURCHASE_MANAGER">Satın alma yöneticisi</option><option value="PURCHASE_STAFF">Satın alma personeli</option><option value="FINANCE_OFFICER">Finans yetkilisi</option><option value="APPROVER">Sipariş onaylayıcı</option><option value="WAREHOUSE_RECEIVER">Depo teslim sorumlusu</option><option value="VIEWER">Görüntüleyici</option></select></label>
              <label>Tek işlem onay limiti (TRY)<input name="approvalLimit" type="number" min="0" step="0.01" defaultValue="25000" /></label>
              <label className="checkboxLabel"><input type="checkbox" name="orderApprovalRequired" defaultChecked /> Her siparişte yönetici onayı iste</label>
              <button className="btn btnPrimary" type="submit"><ShieldCheck size={17} /> Kullanıcı Ekle</button>
            </form> : <div className="cartAlert warning">Kullanıcı ekleme yetkisi yalnızca firma sahibi, satın alma yöneticisi, finans yetkilisi ve onaylayıcı rollerde bulunur.</div>}
          </article>
        </div>
      </section>
    </main>
  );
}
function roleLabel(role?: string) { return ({ COMPANY_OWNER: "Firma sahibi", PURCHASE_MANAGER: "Satın alma yöneticisi", PURCHASE_STAFF: "Satın alma personeli", FINANCE_OFFICER: "Finans yetkilisi", APPROVER: "Onaylayıcı", WAREHOUSE_RECEIVER: "Depo teslim", VIEWER: "Görüntüleyici" } as Record<string, string>)[role ?? ""] ?? "Firma sahibi"; }
function money(value?: string) { return new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY", maximumFractionDigits: 0 }).format(Number(value ?? 0)); }
function param(params: SearchParams, key: string) { const value = params[key]; return Array.isArray(value) ? value[0] ?? "" : value ?? ""; }
