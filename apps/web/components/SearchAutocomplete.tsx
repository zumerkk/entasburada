"use client";

import { Search, Sparkles } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";

interface Suggestion {
  type: "product" | "category";
  label: string;
  secondary: string;
  href: string;
  image?: string;
}

export function SearchAutocomplete({ mobile = false }: { mobile?: boolean }) {
  const listId = useId();
  const timerRef = useRef<number | null>(null);
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [mode, setMode] = useState<string>("");
  const [open, setOpen] = useState(false);

  useEffect(() => () => {
    if (timerRef.current) window.clearTimeout(timerRef.current);
  }, []);

  function schedule(nextQuery: string) {
    setQuery(nextQuery);
    if (timerRef.current) window.clearTimeout(timerRef.current);
    if (nextQuery.trim().length < 2) {
      setSuggestions([]);
      setOpen(false);
      return;
    }
    timerRef.current = window.setTimeout(async () => {
      try {
        const response = await fetch(`/api/search/suggestions?q=${encodeURIComponent(nextQuery.trim())}`);
        if (!response.ok) return;
        const payload = await response.json() as { suggestions?: Suggestion[]; mode?: string };
        setSuggestions(payload.suggestions ?? []);
        setMode(payload.mode ?? "");
        setOpen(true);
      } catch {
        setSuggestions([]);
      }
    }, 180);
  }

  return (
    <form
      className={mobile ? "mobileSearch smartSearch" : "searchBox smartSearch"}
      action="/catalog"
      onFocus={() => suggestions.length > 0 && setOpen(true)}
      onBlur={() => window.setTimeout(() => setOpen(false), 120)}
    >
      {!mobile ? <span className="categoryButton">Akıllı arama</span> : null}
      <label className="srOnly" htmlFor={`${listId}-input`}>Ürün, SKU, barkod veya teknik özellik ara</label>
      <input
        id={`${listId}-input`}
        name="q"
        type="search"
        value={query}
        onChange={(event) => schedule(event.target.value)}
        onKeyDown={(event) => event.key === "Escape" && setOpen(false)}
        placeholder={mobile ? "SKU, barkod veya ürün ara" : "Ürün, SKU, ölçü veya teknik özellik ara"}
        autoComplete="off"
        aria-controls={listId}
        aria-expanded={open}
      />
      <button type="submit" className={mobile ? undefined : "searchButton"} aria-label="Ara">
        <Search size={mobile ? 18 : 20} aria-hidden="true" />
      </button>
      {open ? (
        <div className="searchSuggestions" id={listId} role="listbox">
          {mode === "fuzzy" || mode === "synonym" ? (
            <div className="searchSuggestionHint">
              <Sparkles size={14} aria-hidden="true" />
              {mode === "fuzzy" ? "Yazım hataları düzeltilerek eşleştirildi" : "Teknik eş anlamlılarla eşleştirildi"}
            </div>
          ) : null}
          {suggestions.map((item) => (
            <a href={item.href} role="option" aria-selected="false" key={`${item.type}-${item.href}`}>
              {item.image ? <img src={item.image} alt="" /> : <span className="searchSuggestionIcon">#</span>}
              <span>
                <strong>{item.label}</strong>
                <small>{item.secondary}</small>
              </span>
            </a>
          ))}
          <a className="searchAllResults" href={`/catalog?q=${encodeURIComponent(query)}`}>
            “{query}” için tüm sonuçları göster
          </a>
          <button className="enexSearchAssist" type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => {
            setOpen(false);
            window.dispatchEvent(new CustomEvent("entas-enexai-open", { detail: { prompt: `${query.trim()} arıyorum. Uygun ürünleri ve seçenekleri göster.` } }));
          }}>
            <Sparkles size={16} aria-hidden="true" /> EnexAI ile birlikte bulalım
          </button>
        </div>
      ) : null}
    </form>
  );
}
