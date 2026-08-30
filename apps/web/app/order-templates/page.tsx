import { CalendarClock, PackageCheck, Play, Plus, Trash2 } from "lucide-react";
import { EmptyState, StatusPill } from "@entas/ui";
import { requireCustomer } from "../../lib/customer-auth";
import { listOrderTemplates } from "../../lib/order-template-repository";
import { applyOrderTemplateAction, deleteOrderTemplateAction } from "./actions";

export const dynamic = "force-dynamic";
type SearchParams = Record<string, string | string[] | undefined>;

export default async function OrderTemplatesPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const customer = await requireCustomer();
  const [templates, query] = await Promise.all([listOrderTemplates(customer), searchParams]);
  return (
    <main>
      <section className="shell pageIntro compact"><div><span className="eyebrow dark">Tekrar sipariş</span><h1>Sipariş şablonları</h1><p>Haftalık, aylık veya ihtiyaç oldukça kullandığınız ürün listelerini tek tıkla sepete aktarın.</p></div><a className="btn btnPrimary" href="/cart"><Plus size={17} /> Sepetten Şablon Oluştur</a></section>
      <section className="shell templateWorkspace">
        {param(query, "ok") ? <div className="cartAlert success">{param(query, "ok")}</div> : null}
        {param(query, "error") ? <div className="cartAlert danger">{param(query, "error")}</div> : null}
        {templates.length > 0 ? <div className="templateGrid">{templates.map((template) => (
          <article className="panel templateCard" key={template.id}>
            <div className="templateCardHeader"><CalendarClock size={20} /><StatusPill tone="info">{frequencyLabel(template.frequency)}</StatusPill></div>
            <h2>{template.name}</h2><p>{template.items.length} ürün satırı · {template.items.reduce((sum, item) => sum + item.quantity, 0)} toplam miktar</p>
            <div className="templateItems">{template.items.slice(0, 4).map((item) => <span key={item.id}><strong>{item.productName}</strong><small>{item.quantity} {item.unit} · {item.sku}</small></span>)}{template.items.length > 4 ? <small>+{template.items.length - 4} ürün daha</small> : null}</div>
            <div className="templateActions"><form action={applyOrderTemplateAction}><input type="hidden" name="templateId" value={template.id} /><button className="btn btnPrimary" type="submit"><Play size={15} /> Sepete Aktar</button></form><form action={deleteOrderTemplateAction}><input type="hidden" name="templateId" value={template.id} /><button className="btn btnGhost dark" type="submit"><Trash2 size={15} /> Sil</button></form></div>
          </article>
        ))}</div> : <EmptyState title="Kayıtlı şablon yok" body="Sepetinizi hazırlayın ve haftalık/aylık sipariş şablonu olarak kaydedin." action={<a className="btn btnPrimary" href="/cart"><PackageCheck size={17} /> Sepeti Aç</a>} />}
      </section>
    </main>
  );
}

function frequencyLabel(value: string) { return value === "WEEKLY" ? "Haftalık" : value === "MONTHLY" ? "Aylık" : "İhtiyaç oldukça"; }
function param(params: SearchParams, key: string) { const value = params[key]; return Array.isArray(value) ? value[0] ?? "" : value ?? ""; }
