import { CheckCircle2, Clock3, ShieldCheck, XCircle } from "lucide-react";
import { EmptyState, StatusPill } from "@entas/ui";
import { listCompanyApprovalOrders } from "../../../lib/commercial-repository";
import { canApproveCompanyOrders, requireCustomer } from "../../../lib/customer-auth";
import { respondCompanyOrderAction } from "./actions";

export const dynamic = "force-dynamic";
type SearchParams = Record<string, string | string[] | undefined>;
export default async function CompanyApprovalsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const customer = await requireCustomer();
  const [orders, query] = await Promise.all([listCompanyApprovalOrders(customer), searchParams]);
  const canApprove = canApproveCompanyOrders(customer);
  return <main><section className="shell pageIntro compact"><div><span className="eyebrow dark">Firma onay merkezi</span><h1>Bekleyen sipariş onayları</h1><p>Personelin hazırladığı siparişleri tutar, ürün ve teslimat bilgileriyle değerlendirin.</p></div><a className="btn btnGhost dark" href="/account/team"><ShieldCheck size={17} /> Kullanıcıları Yönet</a></section><section className="shell approvalWorkspace">
    {param(query, "ok") ? <div className="cartAlert success">{param(query, "ok")}</div> : null}{param(query, "error") ? <div className="cartAlert danger">{param(query, "error")}</div> : null}
    {orders.length > 0 ? <div className="approvalList">{orders.map((order) => <article className="panel approvalCard" key={order.id}><div className="approvalCardHeader"><div><StatusPill tone="warning"><Clock3 size={14} /> Onay bekliyor</StatusPill><h2>{order.orderNo}</h2><p>{order.requestedByName || order.dealerUser} · {new Date(order.orderedAt).toLocaleString("tr-TR")}</p></div><strong>{order.totalAmount} {order.currency}</strong></div><div className="approvalItems">{order.items.map((item) => <span key={item.id}><strong>{item.productName}</strong><small>{item.quantity} {item.unit} · {item.lineTotal} {item.currency}</small></span>)}</div>{canApprove ? <form action={respondCompanyOrderAction} className="approvalResponse"><input type="hidden" name="orderId" value={order.id} /><textarea name="note" placeholder="Onay veya red notu (isteğe bağlı)" /><button className="btn btnPrimary" name="decision" value="approve" type="submit"><CheckCircle2 size={16} /> Onayla</button><button className="btn btnGhost dark" name="decision" value="reject" type="submit"><XCircle size={16} /> Reddet</button></form> : <div className="cartAlert warning">Bu rol siparişleri görüntüleyebilir ancak onaylayamaz.</div>}</article>)}</div> : <EmptyState title="Bekleyen firma onayı yok" body="Personelin onaya gönderdiği siparişler burada görünür." action={<a className="btn btnPrimary" href="/account">Hesabıma Dön</a>} />}
  </section></main>;
}
function param(params: SearchParams, key: string) { const value = params[key]; return Array.isArray(value) ? value[0] ?? "" : value ?? ""; }
