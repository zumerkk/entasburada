"use client";

import { useEffect, useRef, useState } from "react";
import { AlertTriangle, Percent, Trash2 } from "lucide-react";

interface AdminBulkSelectionProps {
  /** Mevcut filtreye uyan toplam urun sayisi. */
  filteredTotal: number;
  /** Bu sayfada listelenen urun sayisi. */
  pageCount: number;
  /** Filtreye uyanlar arasinda XML'den senkronize olan kaynak var mi. */
  filterTouchesSyncedSource: boolean;
  bulkSetStatusAction: (formData: FormData) => Promise<void>;
  bulkPriceOperationAction: (formData: FormData) => Promise<void>;
  bulkDeleteProductsAction: (formData: FormData) => Promise<void>;
}

type PriceMode = "percent" | "amount" | "set" | "clear";

const PRICE_MODES: Array<{ mode: PriceMode; label: string; suffix: string; placeholder: string; hint: string }> = [
  {
    mode: "percent",
    label: "Yüzde",
    suffix: "%",
    placeholder: "30",
    hint: "Zam için pozitif (30), iskonto için negatif (-16) girin. Fiyatı olmayan ürünler atlanır."
  },
  {
    mode: "amount",
    label: "Tutar ekle / düş",
    suffix: "₺/$",
    placeholder: "-50",
    hint: "Her ürünün fiyatına sabit tutar ekler (50) veya düşer (-50). Sonuç eksiye düşecek ürünler atlanır."
  },
  {
    mode: "set",
    label: "Sabit fiyat",
    suffix: "₺/$",
    placeholder: "199",
    hint: "Seçimdeki tüm ürünlere aynı fiyatı yazar. Fiyatı olmayan ürünlere de uygulanır."
  },
  {
    mode: "clear",
    label: "Fiyatı kaldır",
    suffix: "",
    placeholder: "",
    hint: "Fiyatı siler; ürün vitrinde “fiyat sorunuz” olarak görünür ve teklif akışına yönlendirir."
  }
];

export function AdminBulkSelection({
  filteredTotal,
  pageCount,
  filterTouchesSyncedSource,
  bulkSetStatusAction,
  bulkPriceOperationAction,
  bulkDeleteProductsAction
}: AdminBulkSelectionProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [selectedCount, setSelectedCount] = useState(0);
  const [scope, setScope] = useState<"selection" | "filtered">("selection");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [priceMode, setPriceMode] = useState<PriceMode>("percent");

  // Kutucuklar sunucu bileseninde satirlarla birlikte render edildigi icin
  // sayim, formun degisim olaylarindan okunur.
  useEffect(() => {
    const form = rootRef.current?.closest("form");
    if (!form) return;

    const recount = () => {
      setSelectedCount(form.querySelectorAll<HTMLInputElement>('input[name="productId"]:checked').length);
    };

    recount();
    form.addEventListener("change", recount);
    return () => form.removeEventListener("change", recount);
  }, []);

  const toggleAllOnPage = (checked: boolean) => {
    const form = rootRef.current?.closest("form");
    if (!form) return;
    for (const box of form.querySelectorAll<HTMLInputElement>('input[name="productId"]')) {
      box.checked = checked;
    }
    setSelectedCount(checked ? form.querySelectorAll('input[name="productId"]').length : 0);
  };

  const activeMode = PRICE_MODES.find((option) => option.mode === priceMode) ?? PRICE_MODES[0]!;
  const targetCount = scope === "filtered" ? filteredTotal : selectedCount;
  const disabled = targetCount === 0;

  return (
    <div className="adminBulkBar" ref={rootRef}>
      <input type="hidden" name="scope" value={scope} />

      <div className="adminBulkScope">
        <label className="checkboxLabel">
          <input
            type="checkbox"
            checked={selectedCount > 0 && selectedCount >= pageCount}
            onChange={(event) => toggleAllOnPage(event.target.checked)}
          />
          Sayfadakileri seç ({pageCount})
        </label>

        <div className="adminBulkScopeChoice" role="radiogroup" aria-label="Toplu işlem kapsamı">
          <button
            type="button"
            className={scope === "selection" ? "active" : ""}
            onClick={() => setScope("selection")}
            aria-pressed={scope === "selection"}
          >
            Seçilenler ({selectedCount.toLocaleString("tr-TR")})
          </button>
          <button
            type="button"
            className={scope === "filtered" ? "active" : ""}
            onClick={() => setScope("filtered")}
            aria-pressed={scope === "filtered"}
          >
            Filtreye uyan hepsi ({filteredTotal.toLocaleString("tr-TR")})
          </button>
        </div>
      </div>

      <p className="adminBulkTarget" aria-live="polite">
        {disabled ? (
          "İşlem yapmak için ürün seçin veya kapsamı değiştirin."
        ) : (
          <>
            Hedef: <strong>{targetCount.toLocaleString("tr-TR")} ürün</strong>
          </>
        )}
      </p>

      <div className="adminBulkGroup">
        <span className="adminBulkGroupTitle">Yayın durumu</span>
        <div className="adminBulkActions">
          <button className="btn btnSecondary" type="submit" formAction={bulkSetStatusAction} name="targetStatus" value="ACTIVE" disabled={disabled}>
            Yayına al
          </button>
          <button className="btn btnGhost dark" type="submit" formAction={bulkSetStatusAction} name="targetStatus" value="PASSIVE" disabled={disabled}>
            Pasife al
          </button>
        </div>
      </div>

      <div className="adminBulkGroup">
        <span className="adminBulkGroupTitle">Toplu fiyat işlemi</span>

        <div className="adminBulkModes" role="group" aria-label="Fiyat işlemi türü">
          {PRICE_MODES.map((option) => (
            <button
              type="button"
              key={option.mode}
              className={priceMode === option.mode ? "active" : ""}
              onClick={() => setPriceMode(option.mode)}
              aria-pressed={priceMode === option.mode}
            >
              {option.label}
            </button>
          ))}
        </div>
        <input type="hidden" name="priceMode" value={priceMode} />

        <div className="adminBulkActions">
          {priceMode === "clear" ? null : (
            <label className="adminBulkPercent">
              <input
                name="priceValue"
                inputMode="decimal"
                placeholder={activeMode.placeholder}
                aria-label={activeMode.label}
                key={priceMode}
              />
              <span>{activeMode.suffix}</span>
            </label>
          )}
          {priceMode === "clear" ? null : (
            <label className="checkboxLabel">
              <input type="checkbox" name="rounding" value="integer" />
              Tam sayıya yuvarla
            </label>
          )}
          <button
            className={priceMode === "clear" ? "btn btnGhost dark" : "btn btnPrimary"}
            type="submit"
            formAction={bulkPriceOperationAction}
            disabled={disabled}
          >
            <Percent size={16} aria-hidden="true" />
            {priceMode === "clear" ? "Fiyatları kaldır" : "Uygula"}
          </button>
        </div>

        <small>{activeMode.hint}</small>

        {priceMode === "amount" || priceMode === "set" ? (
          <p className="adminBulkWarning">
            <AlertTriangle size={15} aria-hidden="true" />
            Sabit tutar işlemleri para birimine bağlıdır. Seçimde TRY, USD ve EUR birlikte varsa işlem reddedilir;
            önce kaynak veya marka filtresiyle tek para birimine indirin.
          </p>
        ) : null}

        {filterTouchesSyncedSource && priceMode !== "clear" ? (
          <p className="adminBulkWarning">
            <AlertTriangle size={15} aria-hidden="true" />
            Seçim tedarikçi portalından senkronize olan bir kaynağı (euromix-stock) kapsıyor. Bu ürünlerde elle
            yapılan fiyat değişikliği bir sonraki portal senkronunda tedarikçi fiyatına döner.
          </p>
        ) : null}
      </div>

      <div className="adminBulkGroup danger">
        <span className="adminBulkGroupTitle">Kalıcı silme</span>
        <div className="adminBulkActions">
          <label className="checkboxLabel">
            <input
              type="checkbox"
              name="confirmDelete"
              checked={confirmDelete}
              onChange={(event) => setConfirmDelete(event.target.checked)}
            />
            {targetCount > 0 ? `${targetCount.toLocaleString("tr-TR")} ürünü kalıcı silmeyi onaylıyorum` : "Kalıcı silmeyi onaylıyorum"}
          </label>
          <button className="btn btnDanger" type="submit" formAction={bulkDeleteProductsAction} disabled={disabled || !confirmDelete}>
            <Trash2 size={16} aria-hidden="true" />
            Kalıcı sil
          </button>
        </div>
        <small>Silinen ürün geçmiş siparişleri etkilemez; geri getirmenin tek yolu kaynağı yeniden içe aktarmaktır.</small>
      </div>
    </div>
  );
}
