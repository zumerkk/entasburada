import { notFound } from "next/navigation";
import { ArrowRight, CheckCircle2, FileText, PackageSearch, ShoppingCart, Trash2, TriangleAlert } from "lucide-react";
import { StatusPill } from "@entas/ui";
import { getAdminOrderById, getQuoteByTrackingCode } from "../../../lib/commercial-repository";
import { requireCustomer } from "../../../lib/customer-auth";
import { getCustomerProject } from "../../../lib/project-repository";
import { addProjectToCartAction, createProjectQuoteAction, deleteProjectAction, selectProjectMatchAction } from "../actions";

export const dynamic = "force-dynamic";
type SearchParams = Record<string, string | string[] | undefined>;

export default async function ProjectDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<SearchParams> }) {
  const customer = await requireCustomer();
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const project = await getCustomerProject(customer, id);
  if (!project) notFound();
  const quotes = (await Promise.all(project.quoteTrackingCodes.map(getQuoteByTrackingCode))).filter(Boolean);
  const orders = (await Promise.all(quotes.map((quote) => quote?.convertedOrderId ? getAdminOrderById(quote.convertedOrderId) : null))).filter(Boolean);
  const exactCount = project.items.filter((item) => item.matchStatus === "EXACT").length;
  const suggestedCount = project.items.filter((item) => item.matchStatus === "SUGGESTED").length;
  const unmatchedCount = project.items.filter((item) => item.matchStatus === "UNMATCHED").length;

  return (
    <main>
      <section className="shell pageIntro compact">
        <div><span className="eyebrow dark">{project.code}</span><h1>{project.name}</h1><p>{project.jobsite || customer.city} · {project.items.length} malzeme satırı</p></div>
        <div className="pageIntroActions"><a className="btn btnGhost dark" href="/projects">Tüm projeler</a><a className="btn btnPrimary" href="/projects/new">Yeni proje</a></div>
      </section>
      <section className="shell projectWorkspace">
        {param(query, "ok") ? <div className="cartAlert success">{param(query, "ok")}</div> : null}
        {param(query, "error") ? <div className="cartAlert danger">{param(query, "error")}</div> : null}
        <div className="projectSummaryGrid">
          <div><CheckCircle2 size={18} /><span>Tam eşleşme</span><strong>{exactCount}</strong></div>
          <div><PackageSearch size={18} /><span>Önerilen muadil</span><strong>{suggestedCount}</strong></div>
          <div><TriangleAlert size={18} /><span>Eşleşmeyen</span><strong>{unmatchedCount}</strong></div>
          <div><FileText size={18} /><span>Teklif / sipariş</span><strong>{quotes.length} / {orders.length}</strong></div>
        </div>
        <article className="panel projectMaterialPanel">
          <div className="panelHeader"><div><h2>Malzeme eşleştirme</h2><p>Tam eşleşmeleri kullanın; önerilen satırlarda gerekirse muadil ürünü değiştirin.</p></div></div>
          <div className="projectMaterialTable">
            {project.items.map((item) => (
              <div className="projectMaterialRow" key={item.id}>
                <span><strong>{item.requestedName || item.requestedSku}</strong><small>{item.requestedSku || "Kod belirtilmedi"} · {item.quantity} {item.unit}</small></span>
                <StatusPill tone={item.matchStatus === "EXACT" ? "success" : item.matchStatus === "SUGGESTED" ? "warning" : "danger"}>{item.matchStatus === "EXACT" ? "Tam eşleşti" : item.matchStatus === "SUGGESTED" ? "Muadil önerildi" : "Bulunamadı"}</StatusPill>
                <span>{item.selectedMatch ? <><a href={`/products/${item.selectedMatch.productSlug}`}><strong>{item.selectedMatch.productName}</strong></a><small>{item.selectedMatch.brand} · {item.selectedMatch.sku} · {stockLabel(item.selectedMatch.stockStatus)}</small></> : <small>Temsilci özel ürün olarak tekliflendirebilir.</small>}</span>
                <span>
                  {item.alternatives.length > 1 ? (
                    <form action={selectProjectMatchAction} className="projectMatchForm">
                      <input type="hidden" name="projectId" value={project.id} /><input type="hidden" name="itemId" value={item.id} />
                      <select name="productSlug" defaultValue={item.selectedMatch?.productSlug}>{item.alternatives.map((alternative) => <option value={alternative.productSlug} key={alternative.productSlug}>{alternative.productName} · {alternative.sku}</option>)}</select>
                      <button type="submit">Muadili kullan</button>
                    </form>
                  ) : <small>{item.alternatives.length ? "Tek uygun eşleşme" : "Satın alma kontrolü gerekli"}</small>}
                </span>
              </div>
            ))}
          </div>
        </article>
        <div className="projectActionBar">
          <form action={addProjectToCartAction}><input type="hidden" name="projectId" value={project.id} /><button className="btn btnSecondary" type="submit"><ShoppingCart size={17} /> Eşleşenleri Sepete Ekle</button></form>
          <form action={createProjectQuoteAction}><input type="hidden" name="projectId" value={project.id} /><button className="btn btnPrimary" type="submit"><FileText size={17} /> Tüm Listeye Teklif Al</button></form>
        </div>
        {quotes.length > 0 ? <article className="panel"><div className="panelHeader"><div><h2>Teklif ve sipariş geçmişi</h2><p>Bu projeden oluşturulan ticari kayıtlar.</p></div></div><div className="accountList upgraded">{quotes.map((quote) => quote ? <a href={`/quote/${quote.trackingCode}`} key={quote.id}><span><strong>{quote.quoteNo}</strong><small>{new Date(quote.requestedAt).toLocaleString("tr-TR")}</small></span><StatusPill tone="info">{quote.status}</StatusPill><ArrowRight size={16} /></a> : null)}{orders.map((order) => order ? <a href={`/orders/${order.trackingCode}`} key={order.id}><span><strong>{order.orderNo}</strong><small>{order.shipmentStatus}</small></span><StatusPill tone="success">{order.status}</StatusPill><ArrowRight size={16} /></a> : null)}</div></article> : null}
        <form action={deleteProjectAction} className="projectDeleteForm"><input type="hidden" name="projectId" value={project.id} /><button type="submit"><Trash2 size={15} /> Projeyi sil</button></form>
      </section>
    </main>
  );
}

function param(params: SearchParams, key: string) { const value = params[key]; return Array.isArray(value) ? value[0] ?? "" : value ?? ""; }
function stockLabel(status: string) { return ({ in_stock: "Stokta", low_stock: "Az stok", incoming: "Tedarikte", out_of_stock: "Stok yok" } as Record<string, string>)[status] ?? status; }
