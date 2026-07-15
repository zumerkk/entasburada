"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Volume2, VolumeX, X } from "lucide-react";
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

const storageKey = "entasburada.videoPopup.v3";

export function VideoPopup() {
  const [settings, setSettings] = useState<PublicVideoPopupResponse | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [needsPlaybackStart, setNeedsPlaybackStart] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const playPromptRef = useRef<HTMLButtonElement>(null);
  const videoSource = useMemo(() => settings?.videoUrl?.trim() ?? "", [settings]);

  const closePopup = useCallback(() => {
    const state = readState();
    writeState({
      ...state,
      dismissedAt: new Date().toISOString(),
      lastShownAt: new Date().toISOString()
    });
    setIsOpen(false);
  }, []);

  const startPlayback = useCallback(async () => {
    const video = videoRef.current;
    if (!video) {
      return;
    }

    video.muted = false;
    video.volume = 1;
    setIsMuted(false);

    try {
      await video.play();
      setNeedsPlaybackStart(false);
    } catch {
      setNeedsPlaybackStart(true);
    }
  }, []);

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
          setNeedsPlaybackStart(true);
          setIsMuted(false);
          setSettings(payload);
          setIsOpen(true);
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
    if (!isOpen) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && settings?.closeOnEsc) {
        closePopup();
        return;
      }

      if (event.key !== "Tab") {
        return;
      }

      const panel = panelRef.current;
      if (!panel) {
        return;
      }

      const focusable = Array.from(panel.querySelectorAll<HTMLElement>("button:not(:disabled), a[href]"))
        .filter((element) => element.getClientRects().length > 0);
      if (focusable.length === 0) {
        event.preventDefault();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) {
        return;
      }

      const activeElement = document.activeElement;
      if (event.shiftKey && (activeElement === first || !panel.contains(activeElement))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (activeElement === last || !panel.contains(activeElement))) {
        event.preventDefault();
        first.focus();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [closePopup, isOpen, settings?.closeOnEsc]);

  useEffect(() => {
    if (!isOpen || !videoSource) {
      return;
    }

    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const frame = window.requestAnimationFrame(() => {
      playPromptRef.current?.focus();
    });

    return () => {
      window.cancelAnimationFrame(frame);
      videoRef.current?.pause();
      document.body.style.overflow = previousOverflow;
      previouslyFocused?.focus();
    };
  }, [isOpen, videoSource]);

  useEffect(() => {
    if (needsPlaybackStart) {
      playPromptRef.current?.focus();
    }
  }, [needsPlaybackStart]);

  if (!settings || !isOpen || !videoSource) {
    return null;
  }

  return (
    <div
      className="videoPopupOverlay"
      role="dialog"
      aria-modal="true"
      aria-label={settings.title || "ENTAŞBURADA açılış videosu"}
      onMouseDown={(event) => {
        if (settings.closeOnOutsideClick && event.target === event.currentTarget) {
          closePopup();
        }
      }}
    >
      <div ref={panelRef} className="videoPopupPanel">
        <div className="videoPopupControls">
          {!needsPlaybackStart ? (
            <button
              className="videoPopupSound"
              type="button"
              aria-label={isMuted ? "Videonun sesini aç" : "Videonun sesini kapat"}
              onClick={() => {
                const video = videoRef.current;
                if (!video) {
                  return;
                }
                video.muted = !video.muted;
                setIsMuted(video.muted);
              }}
            >
              {isMuted ? <VolumeX size={20} aria-hidden="true" /> : <Volume2 size={20} aria-hidden="true" />}
            </button>
          ) : null}
          <button className="videoPopupClose" type="button" aria-label="Açılış videosunu kapat" onClick={closePopup}>
            <X size={20} aria-hidden="true" />
          </button>
        </div>
        <div className="videoPopupMedia">
          <video
            ref={videoRef}
            src={videoSource}
            poster={settings.posterUrl || undefined}
            muted={isMuted}
            playsInline
            preload="auto"
            onPlaying={() => {
              setNeedsPlaybackStart(false);
              const state = readState();
              const now = new Date().toISOString();
              writeState({
                ...state,
                firstShownAt: state.firstShownAt ?? now,
                lastShownAt: now
              });
            }}
            onEnded={() => {
              if (settings.autoCloseOnEnded) {
                closePopup();
              }
            }}
          />
          {needsPlaybackStart ? (
            <button
              ref={playPromptRef}
              className="videoPopupPlayPrompt"
              type="button"
              aria-live="polite"
              onClick={() => void startPlayback()}
            >
              <Volume2 size={28} aria-hidden="true" />
              <span>
                <strong>Giriş için tıkla</strong>
                <small>Video sesli olarak başlayacak.</small>
              </span>
            </button>
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
