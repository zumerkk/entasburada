"use client";

import { useEffect } from "react";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("[app-error]", error.digest ?? "", error.message);
  }, [error]);

  return (
    <main className="informationPage">
      <section className="shell pageIntro informationIntro">
        <div className="informationIntroCopy">
          <span className="eyebrow dark">Beklenmeyen hata</span>
          <h1>Bir şeyler ters gitti</h1>
          <p>
            İşleminiz tamamlanamadı. Sorun geçici olabilir; sayfayı yenilemeyi deneyin. Sorun devam ederse{" "}
            {error.digest ? `şu hata kodunu ileterek ` : ""}destek ekibine ulaşın: destek@entasburada.com
            {error.digest ? ` (kod: ${error.digest})` : ""}
          </p>
          <div className="informationActions">
            <button className="btn btnPrimary" onClick={reset} type="button">
              <span>Tekrar dene</span>
            </button>
            <a className="btn btnGhost dark" href="/">
              <span>Ana sayfaya dön</span>
            </a>
          </div>
        </div>
      </section>
    </main>
  );
}
