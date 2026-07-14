"use client";

import { useState } from "react";
import {
  Cable,
  ChevronRight,
  Container,
  DoorOpen,
  Drill,
  Droplets,
  Gauge,
  Hammer,
  HardHat,
  LayoutGrid,
  PaintRoller,
  ShowerHead,
  Sprout,
  Wrench,
  type LucideIcon
} from "lucide-react";
import type { CatalogTreeNavCategory } from "../lib/catalog-repository";

const ICONS: Record<string, LucideIcon> = {
  wrench: Wrench,
  cable: Cable,
  droplets: Droplets,
  showerhead: ShowerHead,
  gauge: Gauge,
  sprout: Sprout,
  hammer: Hammer,
  drill: Drill,
  "paint-roller": PaintRoller,
  "door-open": DoorOpen,
  container: Container,
  "hard-hat": HardHat
};

export function MegaMenu({ tree }: { tree: CatalogTreeNavCategory[] }) {
  const [open, setOpen] = useState(false);
  const [activeSlug, setActiveSlug] = useState(tree[0]?.slug ?? "");
  const active = tree.find((category) => category.slug === activeSlug) ?? tree[0];

  if (tree.length === 0) {
    return null;
  }

  return (
    <div className="megaMenu" onMouseLeave={() => setOpen(false)}>
      <div className="shell megaMenuInner">
        <button
          type="button"
          className={`megaMenuTrigger${open ? " open" : ""}`}
          aria-expanded={open}
          onMouseEnter={() => setOpen(true)}
          onClick={() => setOpen((value) => !value)}
        >
          <LayoutGrid size={18} aria-hidden="true" />
          Tüm Kategoriler
        </button>

        <nav className="megaMenuQuick" aria-label="Öne çıkan kategoriler">
          {tree.slice(0, 8).map((category) => (
            <a href={category.href} key={category.slug}>
              {category.label}
              <small>{category.count.toLocaleString("tr-TR")}</small>
            </a>
          ))}
        </nav>
      </div>

      {open ? (
        <div className="megaMenuPanel" onMouseEnter={() => setOpen(true)}>
          <div className="shell megaMenuPanelInner">
            <div className="megaMenuRail" role="tablist" aria-label="Kategoriler">
              {tree.map((category) => {
                const Icon = ICONS[category.icon] ?? LayoutGrid;
                const isActive = category.slug === active?.slug;
                return (
                  <button
                    type="button"
                    role="tab"
                    aria-selected={isActive}
                    key={category.slug}
                    className={isActive ? "active" : ""}
                    onMouseEnter={() => setActiveSlug(category.slug)}
                    onClick={() => setActiveSlug(category.slug)}
                  >
                    <Icon size={18} aria-hidden="true" />
                    <span>{category.label}</span>
                    <small>{category.count.toLocaleString("tr-TR")}</small>
                    <ChevronRight size={16} aria-hidden="true" className="megaMenuChevron" />
                  </button>
                );
              })}
            </div>

            {active ? (
              <div className="megaMenuColumns">
                <a className="megaMenuAllLink" href={active.href}>
                  Tüm {active.label} ürünleri ({active.count.toLocaleString("tr-TR")})
                  <ChevronRight size={15} aria-hidden="true" />
                </a>
                <div className="megaMenuColumnGrid">
                  {active.columns.map((column) => (
                    <div className="megaMenuColumn" key={column.heading}>
                      <span className="megaMenuColHead">{column.heading}</span>
                      <ul>
                        {column.items.map((item) => (
                          <li key={item.slug}>
                            <a href={item.href}>{item.label}</a>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
