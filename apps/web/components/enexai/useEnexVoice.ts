"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface RecognitionResult { isFinal: boolean; 0: { transcript: string } }
interface RecognitionEvent { resultIndex: number; results: ArrayLike<RecognitionResult> }
interface Recognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: RecognitionEvent) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}
type VoiceWindow = Window & {
  SpeechRecognition?: new () => Recognition;
  webkitSpeechRecognition?: new () => Recognition;
  webkitAudioContext?: typeof AudioContext;
};

/** Voice is opt-in, and neither recordings nor transcripts are persisted. */
export function useEnexVoice(onTranscript: (text: string) => void) {
  const [enabled, setEnabled] = useState(false);
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [loading, setLoading] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);
  const [hasAudioMeter, setHasAudioMeter] = useState(false);
  const [error, setError] = useState("");
  const audio = useRef<HTMLAudioElement | null>(null);
  const audioContext = useRef<AudioContext | null>(null);
  const objectUrl = useRef<string | null>(null);
  const request = useRef<AbortController | null>(null);
  const recognition = useRef<Recognition | null>(null);
  const animation = useRef(0);
  const transcriptHandler = useRef(onTranscript);
  transcriptHandler.current = onTranscript;

  const stopSpeech = useCallback(() => {
    request.current?.abort();
    request.current = null;
    if (audio.current) {
      audio.current.pause();
      audio.current.onended = null;
      audio.current.onerror = null;
      audio.current = null;
    }
    if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
    objectUrl.current = null;
    if (audioContext.current) void audioContext.current.close().catch(() => undefined);
    audioContext.current = null;
    cancelAnimationFrame(animation.current);
    setSpeaking(false);
    setLoading(false);
    setAudioLevel(0);
    setHasAudioMeter(false);
  }, []);

  const stopListening = useCallback(() => {
    recognition.current?.abort();
    recognition.current = null;
    setListening(false);
  }, []);

  useEffect(() => {
    const voiceWindow = window as VoiceWindow;
    setSupported(Boolean(voiceWindow.SpeechRecognition || voiceWindow.webkitSpeechRecognition));
    return () => {
      stopSpeech();
      stopListening();
    };
  }, [stopSpeech, stopListening]);

  const speak = useCallback(async (text: string) => {
    stopSpeech();
    stopListening();
    setError("");
    setLoading(true);
    const controller = new AbortController();
    request.current = controller;
    const timeout = window.setTimeout(() => controller.abort(), 30_000);
    try {
      const response = await fetch("/api/enexai/speech", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: text.slice(0, 1800) }),
        signal: controller.signal
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({})) as { error?: string };
        throw new Error(payload.error || "Ses şu an hazırlanamadı. Yazışarak devam edebilirsiniz.");
      }
      const blob = await response.blob();
      if (controller.signal.aborted || request.current !== controller) return;
      const url = URL.createObjectURL(blob);
      objectUrl.current = url;
      const player = new Audio(url);
      audio.current = player;
      player.onended = stopSpeech;
      player.onerror = () => { stopSpeech(); setError("Ses oynatılamadı. Yeniden deneyebilirsiniz."); };

      // A real audio meter drives the mascot's mouth instead of a timed lip loop.
      const AudioContextClass = window.AudioContext || (window as VoiceWindow).webkitAudioContext;
      if (AudioContextClass) {
        try {
          const context = new AudioContextClass();
          audioContext.current = context;
          const analyser = context.createAnalyser();
          analyser.fftSize = 256;
          const source = context.createMediaElementSource(player);
          source.connect(analyser);
          analyser.connect(context.destination);
          await context.resume();
          setHasAudioMeter(true);
          const samples = new Uint8Array(analyser.frequencyBinCount);
          let lastSample = 0;
          const sample = (timestamp: number) => {
            if (request.current !== controller || controller.signal.aborted) return;
            if (timestamp - lastSample >= 66) {
              analyser.getByteFrequencyData(samples);
              const mean = samples.reduce((sum, value) => sum + value, 0) / samples.length;
              setAudioLevel(Math.min(1, mean / 65));
              lastSample = timestamp;
            }
            animation.current = requestAnimationFrame(sample);
          };
          animation.current = requestAnimationFrame(sample);
        } catch {
          // Playback is still useful in browsers without an audio analyser.
        }
      }
      if (controller.signal.aborted || request.current !== controller) return;
      await player.play();
      if (controller.signal.aborted || request.current !== controller) { player.pause(); return; }
      setSpeaking(true);
      setLoading(false);
    } catch (cause) {
      if (request.current !== controller) return;
      stopSpeech();
      setError(cause instanceof Error && cause.name !== "AbortError"
        ? cause.message
        : "Ses isteği zaman aşımına uğradı. Yeniden deneyebilirsiniz.");
    } finally {
      window.clearTimeout(timeout);
    }
  }, [stopSpeech, stopListening]);

  const toggleEnabled = useCallback(() => {
    if (enabled) stopSpeech();
    setEnabled(!enabled);
    setError("");
  }, [enabled, stopSpeech]);

  const startListening = useCallback(() => {
    if (listening) {
      recognition.current?.stop();
      return;
    }
    const voiceWindow = window as VoiceWindow;
    const RecognitionClass = voiceWindow.SpeechRecognition || voiceWindow.webkitSpeechRecognition;
    if (!RecognitionClass) {
      setError("Bu tarayıcı sesle yazmayı desteklemiyor. Mesajınızı yazarak gönderebilirsiniz.");
      return;
    }
    stopSpeech();
    setError("");
    const recognizer = new RecognitionClass();
    recognition.current = recognizer;
    recognizer.lang = "tr-TR";
    recognizer.continuous = false;
    recognizer.interimResults = true;
    recognizer.onresult = (event) => {
      if (recognition.current !== recognizer) return;
      const text = Array.from(event.results).map((result) => result[0].transcript).join(" ");
      transcriptHandler.current(text.slice(0, 1600));
    };
    recognizer.onerror = (event) => {
      if (recognition.current !== recognizer) return;
      if (event.error !== "aborted" && event.error !== "no-speech") {
        setError(event.error === "not-allowed"
          ? "Mikrofon izni verilmedi. İsterseniz mesajınızı yazarak gönderebilirsiniz."
          : "Ses algılanamadı. Yeniden deneyebilir veya yazabilirsiniz.");
      }
      setListening(false);
    };
    recognizer.onend = () => { if (recognition.current === recognizer) { setListening(false); recognition.current = null; } };
    try {
      recognizer.start();
      setListening(true);
    } catch {
      setError("Mikrofon başlatılamadı. Yeniden deneyebilirsiniz.");
    }
  }, [listening, stopSpeech]);

  return { enabled, supported, listening, speaking, loading, audioLevel, hasAudioMeter, error, speak, stopSpeech, stopListening, toggleEnabled, startListening, clearError: () => setError("") };
}
