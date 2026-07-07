import {
  AlertTriangle,
  Boxes,
  ClipboardList,
  FileSpreadsheet,
  LayoutDashboard,
  LockKeyhole,
  PackageSearch,
  ReceiptText,
  Settings,
  ShieldCheck,
  Tags,
  Truck,
  UsersRound
} from "lucide-react";
import { MetricCard, StatusPill } from "@entas/ui";
import importReport from "../../../data/import-results/import-report.json";

const menu = [
  { label: "Dashboard", icon: LayoutDashboard },
  { label: "Siparişler", icon: ClipboardList },
  { label: "Teklifler", icon: ReceiptText },
  { label: "Bayiler", icon: UsersRound },
  { label: "Ürünler", icon: PackageSearch },
  { label: "Stok yönetimi", icon: Boxes },
  { label: "Fiyat listeleri", icon: Tags },
  { label: "XML/CSV/XLSX import", icon: FileSpreadsheet },
  { label: "Audit logs", icon: ShieldCheck },
  { label: "Sistem ayarları", icon: Settings }
];

const dealerApplications = [
  ["Bursa Teknik Hırdavat", "İncelemede", "Gold segment adayı", "Satış temsilcisi atanacak"],
  ["Ankara Endüstri Market", "Ek belge bekliyor", "Vergi levhası eksik", "2 gündür bekliyor"],
  ["Ege Oto Servis Tedarik", "Başvuru alındı", "Oto servis", "Yeni başvuru"]
];

const importJobs = importReport.sources.map((source) => [
  source.name,
  source.issueCount === 0 ? "Tamamlandı" : "Hata var",
  `${source.acceptedRows.toLocaleString("tr-TR")} / ${source.totalRows.toLocaleString("tr-TR")} satır`,
  `${source.issueCount.toLocaleString("tr-TR")} hata`
]);

export default function AdminDashboardPage() {
  return (
    <main className="adminShell">
      <aside className="sidebar">
        <a className="adminBrand" href="/">
          <span>E</span>
          <strong>ENTAŞBURADA</strong>
        </a>
        <nav>
          {menu.map((item) => {
            const Icon = item.icon;
            return (
              <a href="#" key={item.label} className={item.label === "Dashboard" ? "active" : ""}>
                <Icon size={18} aria-hidden="true" />
                {item.label}
              </a>
            );
          })}
        </nav>
      </aside>

      <section className="adminMain">
        <header className="adminTopbar">
          <div>
            <span>Operasyon paneli</span>
            <h1>B2B ticaret kontrol merkezi</h1>
          </div>
          <div className="adminTopActions">
            <StatusPill tone="warning">Fiyatlar onaylı bayi kuralına bağlı</StatusPill>
            <button type="button">
              <LockKeyhole size={17} aria-hidden="true" />
              Yetki kontrolü
            </button>
          </div>
        </header>

        <section className="metricGrid" aria-label="Ana metrikler">
          <MetricCard label="Günlük sipariş cirosu" value="₺486.920" trend="+%18 haftalık" tone="success" />
          <MetricCard label="Onay bekleyen bayi" value="24" trend="7 kritik evrak bekliyor" tone="warning" />
          <MetricCard label="İçe aktarılan ürün" value={importReport.totals.products.toLocaleString("tr-TR")} trend="Mirsan + EuroMix XML" tone="info" />
          <MetricCard label="Terk edilen sepet" value="₺92.450" trend="24 saatlik tahmini değer" tone="info" />
        </section>

        <section className="adminGrid">
          <div className="panel wide">
            <div className="panelHeader">
              <div>
                <h2>Bayi başvuru kuyruğu</h2>
                <p>Onay, ek belge, segment ve fiyat grubu ataması tek akışta izlenir.</p>
              </div>
              <button type="button">Tüm başvurular</button>
            </div>
            <div className="table">
              <div className="tableHead">
                <span>Firma</span>
                <span>Durum</span>
                <span>Not</span>
                <span>Aksiyon</span>
              </div>
              {dealerApplications.map((row) => (
                <div className="tableRow" key={row[0]}>
                  <strong>{row[0]}</strong>
                  <StatusPill tone={row[1] === "Ek belge bekliyor" ? "warning" : "info"}>{row[1]}</StatusPill>
                  <span>{row[2]}</span>
                  <span>{row[3]}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="panel">
            <div className="panelHeader compact">
              <h2>Fiyat önceliği</h2>
              <Tags size={20} aria-hidden="true" />
            </div>
            <ol className="priorityList">
              <li>Müşteriye özel manuel fiyat</li>
              <li>Müşteriye özel iskonto</li>
              <li>Tekliften gelen onaylı fiyat</li>
              <li>Müşteri grubu fiyatı</li>
              <li>Ürün kampanya fiyatı</li>
              <li>Marka/kategori kampanyası</li>
              <li>Miktar-koli-palet fiyatı</li>
              <li>Bayi standart fiyatı</li>
              <li>Liste fiyatı</li>
            </ol>
          </div>

          <div className="panel">
            <div className="panelHeader compact">
              <h2>Import merkezi</h2>
              <FileSpreadsheet size={20} aria-hidden="true" />
            </div>
            <div className="jobList">
              {importJobs.map((job) => (
                <div className="jobItem" key={job[0]}>
                  <strong>{job[0]}</strong>
                  <span>{job[1]}</span>
                  <small>{job[2]} · {job[3]}</small>
                </div>
              ))}
            </div>
          </div>

          <div className="panel">
            <div className="panelHeader compact">
              <h2>Stok riskleri</h2>
              <AlertTriangle size={20} aria-hidden="true" />
            </div>
            <div className="alertList">
              <span>ENT-BAG-M8-A2-500: az stok</span>
              <span>ENT-ISG-GLV-C5: tedarik sürecinde</span>
              <span>ENT-ELT-18V-204: hızlı satış nedeniyle 11 gün tahmini tükenme</span>
            </div>
          </div>

          <div className="panel">
            <div className="panelHeader compact">
              <h2>Satış takibi</h2>
              <Truck size={20} aria-hidden="true" />
            </div>
            <div className="behaviorList">
              <div>
                <strong>En çok görüntülenen</strong>
                <span>18V akülü matkap setleri</span>
              </div>
              <div>
                <strong>Sepete eklenip alınmayan</strong>
                <span>Kesme taşı ve iş eldiveni paketleri</span>
              </div>
              <div>
                <strong>Aranıp bulunamayan</strong>
                <span>"spiral yedek kömür", "M10 inox dübel"</span>
              </div>
            </div>
          </div>
        </section>
      </section>
    </main>
  );
}
