import { Building2, CalendarDays, FileSpreadsheet, Plus, ShoppingCart } from "lucide-react";
import { EmptyState, StatusPill } from "@entas/ui";
import { requireCustomer } from "../../lib/customer-auth";
import { listCustomerProjects } from "../../lib/project-repository";

export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;

export default async function ProjectsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const customer = await requireCustomer();
  const [projects, query] = await Promise.all([listCustomerProjects(customer), searchParams]);
  const ok = param(query, "ok");
  const error = param(query, "error");

  return (
    <main>
      <section className="shell pageIntro compact">
        <div>
          <span className="eyebrow dark">Proje satın alma</span>
          <h1>Şantiye ve malzeme listeleri</h1>
          <p>Excel/CSV listenizi ürün kataloğuyla eşleştirin, muadilleri değerlendirin ve tek işlemde teklif alın.</p>
        </div>
        <a className="btn btnPrimary" href="/projects/new"><Plus size={17} /> Yeni Proje</a>
      </section>
      <section className="shell projectWorkspace">
        {ok ? <div className="cartAlert success">{ok}</div> : null}
        {error ? <div className="cartAlert danger">{error}</div> : null}
        {projects.length > 0 ? (
          <div className="projectCardGrid">
            {projects.map((project) => {
              const matched = project.items.filter((item) => item.selectedMatch).length;
              return (
                <a className="projectCard" href={`/projects/${project.id}`} key={project.id}>
                  <div className="projectCardHeading">
                    <Building2 size={20} aria-hidden="true" />
                    <StatusPill tone={project.status === "ORDERED" ? "success" : project.status === "QUOTED" ? "info" : "neutral"}>{statusLabel(project.status)}</StatusPill>
                  </div>
                  <h2>{project.name}</h2>
                  <p>{project.code} · {project.jobsite || customer.city}</p>
                  <div className="projectCardStats">
                    <span><FileSpreadsheet size={15} /> {project.items.length} satır</span>
                    <span><ShoppingCart size={15} /> {matched} eşleşme</span>
                    <span><CalendarDays size={15} /> {formatDate(project.updatedAt)}</span>
                  </div>
                </a>
              );
            })}
          </div>
        ) : (
          <EmptyState title="Henüz proje yok" body="İlk şantiye veya toplu malzeme listenizi oluşturarak başlayın." action={<a className="btn btnPrimary" href="/projects/new">Yeni Proje</a>} />
        )}
      </section>
    </main>
  );
}

function statusLabel(status: string) {
  return ({ PLANNING: "Planlama", QUOTED: "Teklifte", ORDERED: "Siparişte", COMPLETED: "Tamamlandı", ARCHIVED: "Arşiv" } as Record<string, string>)[status] ?? status;
}
function param(params: SearchParams, key: string) { const value = params[key]; return Array.isArray(value) ? value[0] ?? "" : value ?? ""; }
function formatDate(value: string) { return new Date(value).toLocaleDateString("tr-TR"); }
