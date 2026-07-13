"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, CheckCircle2, FileSearch, LoaderCircle, PauseCircle, PlayCircle, UploadCloud } from "lucide-react";
import type { SmartImportJob } from "../../../lib/smart-import-repository";

export function PdfCatalogImporter() {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const pauseRequested = useRef(false);
  const [job, setJob] = useState<SmartImportJob | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function uploadAndProcess(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setBusy(true);
    pauseRequested.current = false;
    try {
      const response = await fetch("/api/admin/import/pdf", { method: "POST", body: new FormData(event.currentTarget) });
      const payload = (await response.json()) as { job?: SmartImportJob; error?: string };
      if (!response.ok || !payload.job) throw new Error(payload.error || "PDF kuyruğa alınamadı.");
      setJob(payload.job);
      await processUntilComplete(payload.job);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "PDF aktarımı başlatılamadı.");
    } finally {
      setBusy(false);
      router.refresh();
    }
  }

  async function processUntilComplete(initialJob: SmartImportJob) {
    let current = initialJob;
    while (!pauseRequested.current && ["queued", "processing"].includes(current.status)) {
      const response = await fetch("/api/admin/import/process", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jobId: current.id, batchSize: 1 })
      });
      const payload = (await response.json()) as { job?: SmartImportJob; error?: string };
      if (!response.ok || !payload.job) throw new Error(payload.error || "PDF sayfası işlenemedi.");
      current = payload.job;
      setJob(current);
    }
    router.refresh();
  }

  async function continueProcessing() {
    if (!job) return;
    setBusy(true);
    setError("");
    pauseRequested.current = false;
    try {
      await processUntilComplete(job);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Analiz devam ettirilemedi.");
    } finally {
      setBusy(false);
      router.refresh();
    }
  }

  function pauseProcessing() {
    pauseRequested.current = true;
    setBusy(false);
  }

  const progress = job?.pdfProgress;
  const finished = job && ["needs_review", "preview", "approved"].includes(job.status);

  return (
    <form className="adminSettingsForm pdfCatalogForm" ref={formRef} onSubmit={uploadAndProcess}>
      <div className="miniPanelTitle">
        <FileSearch size={18} aria-hidden="true" />
        <strong>PDF katalog import</strong>
      </div>
      <label>
        PDF katalog
        <input name="file" type="file" accept="application/pdf,.pdf" required disabled={busy} />
      </label>
      <div className="pdfHintGrid">
        <label>
          Tedarikçi / kaynak
          <input name="sourceName" placeholder="Örn. Taifu 2025" disabled={busy} />
        </label>
        <label>
          Marka ipucu
          <input name="brandHint" placeholder="Örn. TAIFU" disabled={busy} />
        </label>
        <label>
          Kategori ipucu
          <input name="categoryHint" placeholder="Örn. Su pompaları" disabled={busy} />
        </label>
        <label>
          Para birimi
          <select name="defaultCurrency" defaultValue="TRY" disabled={busy}>
            <option value="TRY">TRY</option>
            <option value="USD">USD</option>
            <option value="EUR">EUR</option>
            <option value="GBP">GBP</option>
          </select>
        </label>
        <label>
          İlk sayfa
          <input name="startPage" type="number" min="1" placeholder="1" disabled={busy} />
        </label>
        <label>
          Son sayfa
          <input name="endPage" type="number" min="1" placeholder="Tümü" disabled={busy} />
        </label>
      </div>

      {job ? (
        <div className="pdfImportProgress" aria-live="polite">
          <div>
            <span>{job.fileName}</span>
            <strong>{progress?.percent ?? 0}%</strong>
          </div>
          <progress max="100" value={progress?.percent ?? 0} />
          <small>
            {progress?.processedPages ?? 0}/{progress ? progress.endPage - progress.startPage + 1 : 0} sayfa · {job.extractedProducts.length} ürün · {progress?.failedPages ?? 0} hata
          </small>
        </div>
      ) : null}

      {error ? (
        <div className="importAlert danger" role="alert">
          <AlertTriangle size={17} aria-hidden="true" />
          <span>{error}</span>
        </div>
      ) : null}

      {finished ? (
        <div className="importAlert success">
          <CheckCircle2 size={17} aria-hidden="true" />
          <span>Analiz tamamlandı; {job.extractedProducts.length} ürün admin kontrolü bekliyor.</span>
        </div>
      ) : null}

      <div className="pdfImportActions">
        {!job || finished || job.status === "failed" ? (
          <button className="btn btnSecondary" type="submit" disabled={busy}>
            {busy ? <LoaderCircle className="spinIcon" size={17} aria-hidden="true" /> : <UploadCloud size={17} aria-hidden="true" />}
            PDF Yükle ve Analiz Et
          </button>
        ) : busy ? (
          <button className="btn btnGhost dark" type="button" onClick={pauseProcessing}>
            <PauseCircle size={17} aria-hidden="true" />
            Durdur
          </button>
        ) : (
          <button className="btn btnSecondary" type="button" onClick={continueProcessing}>
            <PlayCircle size={17} aria-hidden="true" />
            Analize Devam Et
          </button>
        )}
      </div>
    </form>
  );
}
