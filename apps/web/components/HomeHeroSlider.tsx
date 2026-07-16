"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowRight, ChevronLeft, ChevronRight, Droplets, PackageSearch, Pause, Play, ShieldCheck, Sprout, Wrench } from "lucide-react";

interface HomeHeroSliderProps {
  metrics: {
    activeProducts: string;
    pricedProducts: string;
    stockedProducts: string;
  };
}

const SLIDES = [
  {
    id: "professional-supply",
    eyebrow: "B2B hırdavat ve endüstriyel tedarik",
    title: "Profesyonellerin tedarik merkezi",
    body: "Binlerce teknik ürünü, bayi fiyatını, stok durumunu ve teklif akışını tek ekranda yönetin.",
    image: "/images/hero-tools-v2.webp",
    href: "/catalog",
    cta: "Ana kataloğu aç",
    Icon: Wrench
  },
  {
    id: "plumbing-systems",
    eyebrow: "Tesisat, vana, pompa ve bağlantı",
    title: "Tesisatın her parçası tek katalogda",
    body: "Uygun ürünü teknik özelliğiyle bulun, miktarı belirleyin ve bayi hesabınıza özel teklifinizi hızla oluşturun.",
    image: "/images/hero-plumbing-v2.webp",
    href: "/catalog?group=su-tesisati",
    cta: "Tesisat ürünlerine git",
    Icon: Droplets
  },
  {
    id: "irrigation-season",
    eyebrow: "Sulama ve bahçe profesyonellerine",
    title: "Sezona doğru ürünle hazır girin",
    body: "Damlama sulama, hortum, bağlantı, pompa ve bahçe ekipmanlarını proje bazında birlikte satın alın.",
    image: "/images/hero-irrigation-v2.webp",
    href: "/catalog?group=sulama-bahce",
    cta: "Sulama kataloğunu aç",
    Icon: Sprout
  }
] as const;

export function HomeHeroSlider({ metrics }: HomeHeroSliderProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [manualPause, setManualPause] = useState(false);
  const [interactionPause, setInteractionPause] = useState(false);
  const touchStartX = useRef<number | null>(null);
  const sliderRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) setManualPause(true);
  }, []);

  useEffect(() => {
    if (manualPause || interactionPause) return;
    const timer = window.setInterval(() => setActiveIndex((current) => (current + 1) % SLIDES.length), 6500);
    return () => window.clearInterval(timer);
  }, [manualPause, interactionPause]);

  const showPrevious = () => setActiveIndex((current) => (current - 1 + SLIDES.length) % SLIDES.length);
  const showNext = () => setActiveIndex((current) => (current + 1) % SLIDES.length);

  return (
    <section className="homeHeroStage" aria-roledescription="carousel" aria-label="ENTAŞ öne çıkan katalogları">
      <div className="homeHeroBrandDecor homeHeroBrandDecorLeft" aria-hidden="true">
        <strong>ENTAŞ</strong>
        <span>Profesyonel tedarik</span>
      </div>
      <img className="homeHeroMascot" src="/images/entas-mascot-v2.png" alt="" aria-hidden="true" />

      <div className="shell homeHeroShell">
        <div
          className="homeHeroSlider"
          ref={sliderRef}
          onMouseEnter={() => setInteractionPause(true)}
          onMouseLeave={() => setInteractionPause(false)}
          onFocusCapture={() => setInteractionPause(true)}
          onBlurCapture={(event) => {
            if (!sliderRef.current?.contains(event.relatedTarget as Node | null)) setInteractionPause(false);
          }}
          onTouchStart={(event) => {
            touchStartX.current = event.touches[0]?.clientX ?? null;
          }}
          onTouchEnd={(event) => {
            const startX = touchStartX.current;
            const endX = event.changedTouches[0]?.clientX;
            touchStartX.current = null;
            if (startX === null || endX === undefined || Math.abs(startX - endX) < 48) return;
            if (startX > endX) showNext();
            else showPrevious();
          }}
        >
          <div className="homeHeroSlides" aria-live="off">
            {SLIDES.map((slide, index) => {
              const isActive = index === activeIndex;
              const Icon = slide.Icon;
              return (
                <article className={`homeHeroSlide${isActive ? " active" : ""}`} aria-hidden={!isActive} key={slide.id}>
                  <img className="homeHeroSlideImage" src={slide.image} alt="" />
                  <div className="homeHeroSlideShade" />
                  <div className="homeHeroSlideContent">
                    <span className="homeHeroEyebrow">
                      <Icon size={17} aria-hidden="true" />
                      {slide.eyebrow}
                    </span>
                    <h1>{slide.title}</h1>
                    <p>{slide.body}</p>
                    <div className="homeHeroActions">
                      <a className="btn btnPrimary" href={slide.href} tabIndex={isActive ? undefined : -1}>
                        <PackageSearch size={18} aria-hidden="true" />
                        {slide.cta}
                      </a>
                      <a className="btn btnHeroSecondary" href="/login" tabIndex={isActive ? undefined : -1}>
                        <ShieldCheck size={18} aria-hidden="true" />
                        Bayi girişi
                      </a>
                    </div>
                  </div>
                  <div className="homeHeroMetrics" aria-label="Platform göstergeleri">
                    <span><strong>{metrics.activeProducts}</strong> aktif ürün</span>
                    <span><strong>{metrics.pricedProducts}</strong> bayi fiyatı</span>
                    <span><strong>{metrics.stockedProducts}</strong> stok görünümü</span>
                  </div>
                </article>
              );
            })}
          </div>

          <button className="homeHeroArrow homeHeroArrowPrev" type="button" onClick={showPrevious} aria-label="Önceki slayt" title="Önceki slayt">
            <ChevronLeft size={24} aria-hidden="true" />
          </button>
          <button className="homeHeroArrow homeHeroArrowNext" type="button" onClick={showNext} aria-label="Sonraki slayt" title="Sonraki slayt">
            <ChevronRight size={24} aria-hidden="true" />
          </button>

          <div className="homeHeroControls">
            <div className="homeHeroTabs" role="tablist" aria-label="Slider sayfaları">
              {SLIDES.map((slide, index) => (
                <button
                  className={index === activeIndex ? "active" : ""}
                  type="button"
                  role="tab"
                  aria-selected={index === activeIndex}
                  aria-label={`${index + 1}. slayt: ${slide.title}`}
                  onClick={() => setActiveIndex(index)}
                  key={slide.id}
                >
                  <img src={slide.image} alt="" />
                  <span>{slide.title}</span>
                </button>
              ))}
            </div>
            <button
              className="homeHeroPause"
              type="button"
              onClick={() => setManualPause((value) => !value)}
              aria-label={manualPause ? "Otomatik geçişi başlat" : "Otomatik geçişi duraklat"}
              title={manualPause ? "Oynat" : "Duraklat"}
            >
              {manualPause ? <Play size={17} aria-hidden="true" /> : <Pause size={17} aria-hidden="true" />}
            </button>
          </div>
        </div>

        <a className="homeHeroDealerLink" href="/dealer-application">
          Bayi başvurusu
          <ArrowRight size={16} aria-hidden="true" />
        </a>
      </div>
    </section>
  );
}
