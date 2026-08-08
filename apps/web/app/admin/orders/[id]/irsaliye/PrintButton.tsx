"use client";

import { Printer } from "lucide-react";

/**
 * Yazdirma penceresini acar. Tarayicinin kendi diyalogunda "PDF olarak kaydet"
 * secenegi bulundugu icin ayri bir PDF uretim kutuphanesine gerek kalmiyor;
 * Turkce karakterler de font gomme sorunu yasamadan dogru cikiyor.
 */
export function PrintButton() {
  return (
    <button className="btn btnPrimary" type="button" onClick={() => window.print()}>
      <Printer size={17} aria-hidden="true" />
      Yazdır / PDF kaydet
    </button>
  );
}
