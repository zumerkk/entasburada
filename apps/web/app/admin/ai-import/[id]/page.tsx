import { notFound } from "next/navigation";
import { ArrowLeft, CheckCircle2, FileText, ImageOff, ListChecks, Save, ShieldAlert, XCircle } from "lucide-react";
import { StatusPill } from "@entas/ui";
import { requireAdmin } from "../../../../lib/admin-auth";
import { getImportJob, type PdfPageAudit, type SmartImportStatus } from "../../../../lib/smart-import-repository";
import { AdminFrame } from "../../AdminFrame";
import { approveSmartImportAction, rejectSmartImportAction, updateSmartImportProductAction } from "../actions";

type SearchParams = Record<string, string | string[] | undefined>;

export const dynamic = "force-dynamic";

export default async function ImportReviewPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<SearchParams> }) {
  await requireAdmin();
  const { id } = await params;
  const query = await searchParams;
  const job = await getImportJob(id);
  if (!job) notFound();

  const page = Math.max(1, Number(getParam(query, "page") || "1"));
  const limit = 20;
  const pageCount = Math.max(1, Math.ceil(job.extractedProducts.length / limit));
  const products = job.extractedProducts.slice((page - 1) * limit, page * limit);
  const activeProducts = job.extractedProducts.filter((product) => !product.excluded);
  const imageCount = activeProducts.filter((product) => product.imageUrl).length;
  const reviewedCount = activeProducts.filter((product) => product.manuallyReviewed).length;
  const readyCount = activeProducts.filter((product) => product.confidenceScore >= 70 || product.manuallyReviewed).length;
  const pageAudits = [...(job.pageAudits ?? [])].sort((a, b) => a.pageNumber - b.pageNumber);

  return (
    <AdminFrame active="ai-import">
      <header className="adminTopbar">
        <div>
          <span>PDF katalog inceleme</span>
          <h1>{job.sourceName}</h1>
        </div>
        <div className="adminTopActions">
          <a className="btn btnGhost dark" href="/admin/ai-import">
            <ArrowLeft size={17} aria-hidden="true" />
            Import merkezi
          </a>
          <form action={approveSmartImportAction}>
            <input type="hidden" name="jobId" value={job.id} />
            <button className="btn btnPrimary" type="submit" disabled={["queued", "processing", "approved", "rejected", "failed"].includes(job.status) || readyCount === 0}>
              <CheckCircle2 size={17} aria-hidden="true" />
              {job.status === "approved" ? "Kataloğa Aktarıldı" : "Kontrol Edilenleri Aktar"}
            </button>
          </form>
        </div>
      </header>

      <section className="importReviewSummary" aria-label="Import özeti">
        <div>
          <span>Durum</span>
          <StatusPill tone={statusTone(job.status)}>{job.status}</StatusPill>
        </div>
        <div>
          <span>Sayfa</span>
          <strong>{job.pdfProgress ? `${job.pdfProgress.processedPages}/${job.pdfProgress.endPage - job.pdfProgress.startPage + 1}` : "-"}</strong>
        </div>
        <div>
          <span>Ürün adayı</span>
          <strong>{activeProducts.length.toLocaleString("tr-TR")}</strong>
        </div>
        <div>
          <span>Görselli</span>
          <strong>{imageCount.toLocaleString("tr-TR")}</strong>
        </div>
        <div>
          <span>Admin kontrolü</span>
          <strong>{reviewedCount.toLocaleString("tr-TR")}</strong>
        </div>
        <div>
          <span>Aktarıma hazır</span>
          <strong>{readyCount.toLocaleString("tr-TR")}</strong>
        </div>
      </section>

      {job.lastError ? (
        <div className="importAlert danger">
          <ShieldAlert size={18} aria-hidden="true" />
          <span>{job.lastError}</span>
        </div>
      ) : null}

      {pageAudits.length ? (
        <section className="pageAuditPanel" aria-labelledby="page-audit-title">
          <header>
            <div>
              <ListChecks size={19} aria-hidden="true" />
              <h2 id="page-audit-title">Sayfa kalite denetimi</h2>
            </div>
            <span>{pageAudits.filter((audit) => audit.status === "ok").length}/{pageAudits.length} temiz sayfa</span>
          </header>
          <div className="pageAuditTableWrap">
            <table className="pageAuditTable">
              <thead>
                <tr>
                  <th>Sayfa</th>
                  <th>Durum</th>
                  <th>Ürün</th>
                  <th>Görselli</th>
                  <th>Benzersiz görsel</th>
                  <th>AI karşılaştırma</th>
                  <th>Sağlayıcı</th>
                </tr>
              </thead>
              <tbody>
                {pageAudits.map((audit) => {
                  const singleProvider = (audit.verification?.openAiOnlyProducts ?? 0) + (audit.verification?.geminiOnlyProducts ?? 0);
                  return (
                    <tr key={audit.pageNumber}>
                      <td><strong>{audit.pageNumber}</strong></td>
                      <td><StatusPill tone={auditStatusTone(audit.status)}>{auditStatusLabel(audit.status)}</StatusPill></td>
                      <td>{audit.extractedProducts}</td>
                      <td>{audit.productsWithImages}</td>
                      <td>{audit.uniqueImages}{audit.sharedImageAssignments ? <small> +{audit.sharedImageAssignments} ortak atama</small> : null}</td>
                      <td>
                        {audit.model.endsWith("-structured-v1")
                          ? <span>PDF kodu + yerleşim doğrulandı</span>
                          : audit.verification
                          ? <span>{audit.verification.matchedProducts} eşleşen · {singleProvider} tek AI · {audit.verification.conflictingProducts} fark</span>
                          : <span>Tek sağlayıcı</span>}
                      </td>
                      <td><span>{audit.model.endsWith("-structured-v1") ? "Yapısal PDF" : audit.provider}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      <section className="reviewProductList" aria-label="Çıkarılan ürünler">
        {products.map((product) => (
          <form className={`reviewProductRow${product.excluded ? " excluded" : ""}`} action={updateSmartImportProductAction} key={product.id}>
            <input type="hidden" name="jobId" value={job.id} />
            <input type="hidden" name="productId" value={product.id} />
            <div className="reviewProductImage">
              {product.imageUrl ? <img src={product.imageUrl} alt={product.productName} /> : <ImageOff size={28} aria-label="Ürün görseli çıkarılamadı" />}
              <span>PDF s. {product.sourcePage ?? "-"}</span>
            </div>

            <div className="reviewProductFields">
              <div className="reviewProductHeading">
                <div>
                  <strong>{product.productName}</strong>
                  <span>{product.sku} · güven {product.confidenceScore}</span>
                </div>
                <div>
                  {product.manuallyReviewed ? <StatusPill tone="success">kontrol edildi</StatusPill> : <StatusPill tone={product.confidenceScore >= 70 ? "info" : "warning"}>AI çıkarımı</StatusPill>}
                  {product.duplicateRisk !== "none" ? <StatusPill tone="warning">mükerrer {product.duplicateRisk}</StatusPill> : null}
                </div>
              </div>

              <div className="reviewFieldGrid primary">
                <label>
                  Ürün adı
                  <input name="productName" defaultValue={product.productName} required />
                </label>
                <label>
                  SKU / model
                  <input name="sku" defaultValue={product.sku} required />
                </label>
                <label>
                  Marka
                  <input name="brandName" defaultValue={product.brandName} required />
                </label>
                <label>
                  Kategori
                  <input name="categoryName" defaultValue={product.categoryName} required />
                </label>
                <label>
                  Barkod
                  <input name="barcode" defaultValue={product.barcode} />
                </label>
                <label>
                  Üretici kodu
                  <input name="manufacturerCode" defaultValue={product.manufacturerCode} />
                </label>
              </div>

              <div className="reviewFieldGrid commercial">
                <label>
                  Liste fiyatı
                  <input name="listPrice" defaultValue={product.listPrice} inputMode="decimal" />
                </label>
                <label>
                  Para birimi
                  <select name="currency" defaultValue={product.currency}>
                    <option value="TRY">TRY</option>
                    <option value="USD">USD</option>
                    <option value="EUR">EUR</option>
                    <option value="GBP">GBP</option>
                  </select>
                </label>
                <label>
                  KDV %
                  <input name="taxRate" defaultValue={product.taxRate} inputMode="decimal" />
                </label>
                <label>
                  Birim
                  <input name="unitType" defaultValue={product.unitType} />
                </label>
                <label>
                  Stok adedi
                  <input name="stockQuantity" type="number" min="0" step="0.01" defaultValue={product.stockQuantity} />
                </label>
                <label>
                  Stok durumu
                  <select name="stockStatus" defaultValue={product.stockStatus}>
                    <option value="in_stock">Stokta</option>
                    <option value="low_stock">Az stok</option>
                    <option value="incoming">Tedarik sürecinde</option>
                    <option value="out_of_stock">Stok yok</option>
                  </select>
                </label>
              </div>

              <div className="reviewFieldGrid packaging">
                <label>Minimum <input name="minOrder" type="number" min="1" defaultValue={product.minOrder} /></label>
                <label>Paket <input name="packageQuantity" type="number" min="1" defaultValue={product.packageQuantity} /></label>
                <label>Koli <input name="cartonQuantity" type="number" min="1" defaultValue={product.cartonQuantity} /></label>
                <label>Palet <input name="palletQuantity" type="number" min="1" defaultValue={product.palletQuantity} /></label>
                <label>Garanti (ay) <input name="warrantyMonths" type="number" min="0" defaultValue={product.warrantyMonths} /></label>
              </div>

              <div className="reviewTextGrid">
                <label>
                  Açıklama
                  <textarea name="description" defaultValue={product.description} />
                </label>
                <label>
                  Teknik özellikler
                  <textarea name="technicalSpecs" defaultValue={specText(product.specifications, product.technicalSpecs)} />
                </label>
              </div>

              <label className="reviewImageUrlField">
                Görsel URL
                <input name="imageUrl" defaultValue={product.imageUrl} placeholder="/uploads/... veya https://cdn..." />
              </label>

              {product.extractionWarnings.length ? (
                <div className="reviewWarnings">
                  {product.extractionWarnings.slice(0, 4).map((warning) => <span key={warning}>{warning}</span>)}
                </div>
              ) : null}

              <div className="reviewProductActions">
                <label className="checkLine">
                  <input name="stockQuantityKnown" type="checkbox" defaultChecked={product.stockQuantityKnown} />
                  Stok adedi katalogda doğrulandı
                </label>
                <label className="checkLine danger">
                  <input name="excluded" type="checkbox" defaultChecked={product.excluded} />
                  Bu kaydı aktarma
                </label>
                <label className="checkLine danger">
                  <input name="removeImage" type="checkbox" />
                  Yanlış görseli kaldır
                </label>
                <button className="btn btnSecondary" type="submit">
                  <Save size={16} aria-hidden="true" />
                  Kaydet ve Kontrol Edildi İşaretle
                </button>
              </div>
            </div>
          </form>
        ))}
        {products.length === 0 ? (
          <div className="importEmptyState">
            <FileText size={26} aria-hidden="true" />
            <strong>Bu job için ürün adayı bulunamadı.</strong>
          </div>
        ) : null}
      </section>

      <nav className="pagination adminPagination" aria-label="Ürün adayı sayfalama">
        <a className={page <= 1 ? "disabled" : ""} href={page <= 1 ? "#" : `?page=${page - 1}`}>Önceki</a>
        <span>{page} / {pageCount}</span>
        <a className={page >= pageCount ? "disabled" : ""} href={page >= pageCount ? "#" : `?page=${page + 1}`}>Sonraki</a>
      </nav>

      <form className="reviewRejectAction" action={rejectSmartImportAction}>
        <input type="hidden" name="jobId" value={job.id} />
        <button className="btn btnGhost dark" type="submit" disabled={job.status === "rejected" || job.status === "approved"}>
          <XCircle size={17} aria-hidden="true" />
          Jobu Reddet
        </button>
      </form>
    </AdminFrame>
  );
}

function statusTone(status: SmartImportStatus): "success" | "warning" | "danger" | "info" | "neutral" {
  if (status === "approved") return "success";
  if (status === "failed" || status === "rejected") return "danger";
  if (status === "needs_review") return "warning";
  if (status === "queued" || status === "processing") return "info";
  return "neutral";
}

function auditStatusTone(status: PdfPageAudit["status"]): "success" | "warning" | "danger" | "neutral" {
  if (status === "ok") return "success";
  if (status === "failed") return "danger";
  if (status === "needs_review") return "warning";
  return "neutral";
}

function auditStatusLabel(status: PdfPageAudit["status"]): string {
  if (status === "ok") return "Temiz";
  if (status === "failed") return "Hatalı";
  if (status === "needs_review") return "Kontrol";
  return "Ürün yok";
}

function specText(specs: Array<{ label: string; value: string }>, fallback: string): string {
  return specs.length ? specs.map((spec) => `${spec.label}: ${spec.value}`).join("\n") : fallback;
}

function getParam(params: SearchParams, key: string): string {
  const value = params[key];
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}
