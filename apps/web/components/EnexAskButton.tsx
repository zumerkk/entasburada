"use client";

import { Sparkles } from "lucide-react";

export function EnexAskButton({ label = "EnexAI'ye sor", prompt, tab }: { label?: string; prompt?: string; tab?: "chat" | "discover" | "orders" }) {
  return <button className="enexAskButton" type="button" onClick={() => window.dispatchEvent(new CustomEvent("entas-enexai-open", { detail: { prompt, tab } }))}><Sparkles size={16} aria-hidden="true" />{label}</button>;
}
