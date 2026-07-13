"use client";

import { useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";
import { shouldShowVideoPopup, type VideoPopupFrequency, type VideoPopupState } from "../lib/video-popup-policy";

interface PublicVideoPopupResponse {
  enabled: boolean;
  title: string;
  description: string;
  videoUrl: string;
  posterUrl: string;
  ctaText: string;
  ctaHref: string;
  frequency: VideoPopupFrequency;
  startsAt: string;
  endsAt: string;
  showToGuests: boolean;
  showToCustomers: boolean;
  segmentTargets: string[];
  closeOnOutsideClick: boolean;
  closeOnEsc: boolean;
  autoCloseOnEnded: boolean;
}

const storageKey = "entasburada.videoPopup";

export function VideoPopup() {
  const [settings, setSettings] = useState<PublicVideoPopupResponse | null>(null);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    if (window.location.pathname.startsWith("/admin")) {
      return;
    }

    let mounted = true;
    fetch("/api/public/video-popup", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((payload: PublicVideoPopupResponse | null) => {
        if (!mounted || !payload) {
          return;
        }

        const state = readState();
        const shouldShow = shouldShowVideoPopup({
          enabled: payload.enabled,
          frequency: payload.frequency,
          startsAt: payload.startsAt,
          endsAt: payload.endsAt,
          state
        });

        if (shouldShow) {
          setSettings(payload);
          setIsOpen(true);
          writeState({
            ...state,
            firstShownAt: state.firstShownAt ?? new Date().toISOString(),
            lastShownAt: new Date().toISOString()
          });
        }
      })
      .catch(() => {
        setSettings(null);
      });

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!settings?.closeOnEsc || !isOpen) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closePopup();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [settings, isOpen]);

  const videoSource = useMemo(() => settings?.videoUrl?.trim() ?? "", [settings]);

  if (!settings || !isOpen || !videoSource) {
    return null;
  }

  function closePopup() {
    const state = readState();
    writeState({
      ...state,
      dismissedAt: new Date().toISOString(),
      lastShownAt: new Date().toISOString()
    });
    setIsOpen(false);
  }

  return (
    <div
      className="videoPopupOverlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="video-popup-title"
      onMouseDown={(event) => {
        if (settings.closeOnOutsideClick && event.target === event.currentTarget) {
          closePopup();
        }
      }}
    >
      <div className="videoPopupPanel">
        <button className="videoPopupClose" type="button" aria-label="Tanıtım videosunu kapat" onClick={closePopup}>
          <X size={20} aria-hidden="true" />
        </button>
        <div className="videoPopupMedia">
          <video
            src={videoSource}
            poster={settings.posterUrl || undefined}
            controls
            autoPlay
            muted
            playsInline
            preload="metadata"
            onEnded={() => {
              if (settings.autoCloseOnEnded) {
                closePopup();
              }
            }}
          />
        </div>
        <div className="videoPopupContent">
          <div>
            <span>ENTAŞBURADA</span>
            <h2 id="video-popup-title">{settings.title}</h2>
            {settings.description ? <p>{settings.description}</p> : null}
          </div>
          {settings.ctaText && settings.ctaHref ? (
            <a className="btn btnPrimary" href={settings.ctaHref} onClick={closePopup}>
              {settings.ctaText}
            </a>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function readState(): VideoPopupState {
  try {
    const value = window.localStorage.getItem(storageKey);
    return value ? (JSON.parse(value) as VideoPopupState) : {};
  } catch {
    return {};
  }
}

function writeState(state: VideoPopupState): void {
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(state));
  } catch {
    // LocalStorage can be disabled; the popup still remains closable in memory.
  }
}
