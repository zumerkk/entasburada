"use client";

import { useId, type CSSProperties } from "react";
import styles from "./EnexMascot.module.css";

export type EnexMascotState = "idle" | "thinking" | "speaking" | "listening" | "celebrating";

export type EnexMascotProps = {
  state?: EnexMascotState;
  /** Height in CSS pixels. The illustration remains sharp at any resolution. */
  size?: number;
  className?: string;
  /** Normalized audio amplitude (0–1); omit for the speech-animation fallback. */
  audioLevel?: number;
};

/** Entaş's original orange hammer mascot, rigged for the EnexAI assistant. */
export function EnexMascot({ state = "idle", size = 140, className = "", audioLevel }: EnexMascotProps) {
  const id = `enex-${useId().replace(/:/g, "")}`;
  const paint = (name: string) => `url(#${id}-${name})`;
  const amplitude = typeof audioLevel === "number" && Number.isFinite(audioLevel)
    ? Math.max(0, Math.min(1, audioLevel))
    : undefined;
  const style = {
    width: size * 0.72,
    height: size,
    "--enex-mouth-open": amplitude === undefined ? 0.45 : 0.08 + amplitude * 0.92,
  } as CSSProperties;

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 260 360"
      width={size * 0.72}
      height={size}
      aria-hidden="true"
      focusable="false"
      data-state={state}
      data-audio-driven={amplitude === undefined ? "false" : "true"}
      className={`${styles.mascot} ${className}`}
      style={style}
    >
      <defs>
        <linearGradient id={`${id}-orange`} x1="55" y1="50" x2="184" y2="179" gradientUnits="userSpaceOnUse">
          <stop stopColor="#ffe397" />
          <stop offset=".25" stopColor="#ffbc42" />
          <stop offset=".64" stopColor="#ffa321" />
          <stop offset="1" stopColor="#e47e12" />
        </linearGradient>
        <linearGradient id={`${id}-limb`} x1="0" y1="0" x2="1" y2=".6">
          <stop stopColor="#ffdc7b" />
          <stop offset=".55" stopColor="#ffb231" />
          <stop offset="1" stopColor="#e18418" />
        </linearGradient>
        <linearGradient id={`${id}-teal`} x1="0" y1="0" x2=".8" y2="1">
          <stop stopColor="#6ce1d6" />
          <stop offset=".36" stopColor="#1dbbb8" />
          <stop offset=".72" stopColor="#079b9d" />
          <stop offset="1" stopColor="#04737a" />
        </linearGradient>
        <linearGradient id={`${id}-white`} x1="0" y1="0" x2="1" y2="1">
          <stop stopColor="#fff" />
          <stop offset="1" stopColor="#d9efee" />
        </linearGradient>
        <radialGradient id={`${id}-eye`} cx=".32" cy=".3" r=".8">
          <stop stopColor="#354849" />
          <stop offset=".52" stopColor="#152729" />
          <stop offset="1" stopColor="#071617" />
        </radialGradient>
      </defs>

      <g className={styles.character} stroke="#16454a" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round">
        {/* Legs stay behind the long hammer handle. */}
        <g className={styles.legs}>
          <path d="M88 294C91 303 94 313 98 323L112 323C108 309 106 300 103 291Z" fill={paint("limb")} />
          <path d="M116 248C136 272 140 296 144 323L159 322C157 289 145 262 130 242Z" fill={paint("limb")} />
          <path d="M87 319Q96 312 111 317L116 335Q119 347 107 350L69 350Q60 349 64 339Q70 325 89 329Z" fill={paint("teal")} />
          <path d="M64 344Q86 350 114 342L114 348Q90 357 67 351Z" fill="#0b535e" strokeWidth="1.8" />
          <path d="M140 316Q148 311 160 316L163 329Q181 328 189 341Q194 350 185 351L147 350Q137 349 137 340Z" fill={paint("teal")} />
          <path d="M139 343Q160 350 191 344L190 350Q164 356 141 350Z" fill="#0b535e" strokeWidth="1.8" />
          <path d="M74 336Q82 330 89 332M153 331Q167 328 176 337" stroke="#b4ffed" strokeWidth="3.5" opacity=".65" />
        </g>

        {/* Far arm and glove. */}
        <g>
          <path d="M117 139C87 153 65 180 47 205L58 214C76 193 100 172 124 159Z" fill={paint("limb")} />
          <path d="M43 202Q53 199 62 209L57 220L40 215Z" fill={paint("teal")} />
          <path d="M44 211C30 211 26 218 25 230C25 239 29 244 33 241C35 251 41 251 43 243C45 251 51 248 52 241C58 246 64 240 61 233L54 219Z" fill={paint("teal")} />
          <path d="M34 226L33 238M43 227L42 242M50 225L51 239" fill="none" strokeWidth="1.6" />
          <path d="M31 222Q35 216 42 218" fill="none" stroke="#a1f8e6" strokeWidth="2.8" opacity=".8" />
        </g>

        {/* Near arm pivots from the shoulder when greeting or celebrating. */}
        <g className={styles.waveArm}>
          <path d="M150 148C151 169 156 193 173 198C187 202 201 188 208 176L220 182C210 205 190 219 170 213C145 205 138 181 136 158Z" fill={paint("limb")} />
          <path d="M203 169Q211 165 225 177L219 190Q207 191 196 181Z" fill={paint("teal")} />
          <path d="M208 174C201 168 200 164 202 157L195 140C192 132 197 129 202 133L212 144L218 122C220 114 227 115 227 123L226 141L234 125C239 118 245 123 242 129L236 146L246 136C252 131 258 137 252 143L239 158C236 169 223 181 215 177Z" fill={paint("teal")} />
          <path d="M215 148Q222 151 225 159M226 141L224 149M236 146L231 152" fill="none" strokeWidth="1.6" />
          <path d="M219 125L217 141M203 140L208 148" stroke="#b4ffed" strokeWidth="2.4" opacity=".7" />
        </g>

        {/* One continuous hammer shape preserves the Entaş mascot silhouette. */}
        <path d="M157 25L158 13Q159 8 164 9L188 18Q192 20 190 25L187 35Z" fill={paint("limb")} />
        <path
          d="M34 80C55 45 91 20 121 23C151 25 178 36 193 48C204 57 212 58 229 64L216 104C195 92 180 105 168 124C151 150 137 190 117 276C114 291 103 303 88 301C72 300 66 288 70 272L117 137C122 121 122 106 111 91C91 64 65 64 34 80ZM101 272A10 10 0 1 1 81 272A10 10 0 1 1 101 272Z"
          fill={paint("orange")}
          fillRule="evenodd"
        />
        <path d="M45 69C71 38 99 27 121 29C144 30 168 40 180 47" fill="none" stroke="#fff5c5" strokeWidth="5.5" opacity=".8" />
        <path d="M127 134C120 159 98 219 81 272Q77 286 86 292" fill="none" stroke="#ffdf83" strokeWidth="6" opacity=".6" />
        <path d="M101 272A10 10 0 1 1 81 272A10 10 0 1 1 101 272Z" fill="none" stroke="#aa672a" strokeWidth="3" />
        <path d="M223 56Q224 51 230 53L250 61Q255 63 253 69L239 109Q237 115 231 113L211 105Q206 103 209 97Z" fill={paint("teal")} />
        <path d="M226 60L247 68L241 84L219 77Z" fill="#79e5dc" stroke="none" opacity=".28" />
        <path d="M215 99L226 60L246 67" stroke="#b5fff0" strokeWidth="3" opacity=".65" fill="none" />

        <g className={styles.face}>
          <path d="M123 46Q132 39 143 44M165 53Q177 51 184 62" fill="none" stroke="#734312" strokeWidth="2.8" />
          <g className={styles.eyes}>
            <g transform="rotate(11 135 69)">
              <ellipse cx="135" cy="69" rx="12.8" ry="17.2" fill={paint("white")} strokeWidth="2.3" />
              <ellipse className={styles.pupil} cx="137" cy="71" rx="8" ry="11.7" fill={paint("eye")} strokeWidth="1" />
              <ellipse cx="139" cy="64" rx="3.5" ry="4.5" fill="#fff" stroke="none" />
              <circle cx="133" cy="77" r="1.5" fill="#a2dfe0" stroke="none" />
            </g>
            <g transform="rotate(15 171 82)">
              <ellipse cx="171" cy="82" rx="12.7" ry="17.5" fill={paint("white")} strokeWidth="2.3" />
              <ellipse className={styles.pupil} cx="173" cy="84" rx="8.1" ry="12" fill={paint("eye")} strokeWidth="1" />
              <ellipse cx="175" cy="77" rx="3.5" ry="4.5" fill="#fff" stroke="none" />
              <circle cx="169" cy="90" r="1.5" fill="#a2dfe0" stroke="none" />
            </g>
          </g>
          <path d="M126 98Q134 112 151 109" fill="none" stroke="#663b16" strokeWidth="2.9" className={styles.smile} />
          <g className={styles.talkingMouth}>
            <path d="M126 99Q141 110 155 106Q150 126 138 119Q129 115 126 99Z" fill="#55322c" stroke="#78401b" strokeWidth="1.7" />
            <path d="M129 101Q142 109 152 108L149 111Q138 112 131 106Z" fill="#fffef3" stroke="none" />
            <path d="M136 116Q144 112 149 117Q142 122 136 116Z" fill="#f68b83" stroke="none" />
          </g>
          <ellipse cx="120" cy="92" rx="6" ry="3.5" fill="#f39035" stroke="none" opacity=".35" />
          <ellipse cx="178" cy="107" rx="5" ry="3" fill="#f39035" stroke="none" opacity=".35" />
        </g>
      </g>

      <g className={styles.listeningMarks} fill="none" stroke="#0baba7" strokeWidth="3" strokeLinecap="round">
        <path d="M18 105Q9 91 18 76M8 113Q-5 91 8 69" />
      </g>
      <g className={styles.thinkingDots} fill="#0b938f">
        <circle cx="18" cy="55" r="3" /><circle cx="24" cy="43" r="4" /><circle cx="34" cy="29" r="5" />
      </g>
      <g className={styles.sparkles} fill="#ffc64a" stroke="#df9e26" strokeWidth="1">
        <path d="M30 112L33 119L40 122L33 125L30 132L27 125L20 122L27 119Z" />
        <path d="M221 21L224 29L232 32L224 35L221 43L218 35L210 32L218 29Z" />
        <path d="M229 247L231 252L236 254L231 256L229 261L227 256L222 254L227 252Z" />
      </g>
    </svg>
  );
}
