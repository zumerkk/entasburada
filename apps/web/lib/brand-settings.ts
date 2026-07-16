import "server-only";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import type { VideoPopupFrequency } from "./video-popup-policy";

export interface VideoPopupSettings {
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
  updatedAt: string;
}

export interface BrandSettings {
  siteName: string;
  siteTitle: string;
  tagline: string;
  headerLogoUrl: string;
  mobileLogoUrl: string;
  footerLogoUrl: string;
  adminLogoUrl: string;
  faviconUrl: string;
  updatedAt: string;
  videoPopup: VideoPopupSettings;
}

export interface PublicVideoPopupSettings extends VideoPopupSettings {
  customerSegment?: string;
}

export type BrandSettingsInput = {
  [Key in keyof BrandSettings]?: BrandSettings[Key] | undefined;
};

export type VideoPopupSettingsInput = {
  [Key in keyof VideoPopupSettings]?: VideoPopupSettings[Key] | undefined;
};

const rootDir = findWorkspaceRoot(process.cwd());
const dataDir = path.join(rootDir, "data");
const settingsPath = path.join(dataDir, "brand-settings.json");
const publicBrandDir = path.join(rootDir, "apps", "web", "public", "uploads", "brand");

const defaultSettings: BrandSettings = {
  siteName: "ENTAŞ",
  siteTitle: "ENTAŞBURADA",
  tagline: "Türkiye'nin Yapı Marketi",
  headerLogoUrl: "/brand/entas-logo.png",
  mobileLogoUrl: "/brand/entas-logo.png",
  footerLogoUrl: "/brand/entas-logo.png",
  adminLogoUrl: "/brand/entas-logo.png",
  faviconUrl: "/brand/entas-logo.png",
  updatedAt: new Date(0).toISOString(),
  videoPopup: {
    enabled: true,
    title: "ENTAŞBURADA'ya hoş geldiniz",
    description: "Profesyonel B2B tedarik, bayi fiyatlandırması ve hızlı teklif akışını tanıyın.",
    videoUrl: "/brand/entas-intro.mp4",
    posterUrl: "/brand/entas-logo.png",
    ctaText: "Ana kataloğa git",
    ctaHref: "/catalog",
    frequency: "first_visit",
    startsAt: "",
    endsAt: "",
    showToGuests: true,
    showToCustomers: true,
    segmentTargets: [],
    closeOnOutsideClick: true,
    closeOnEsc: true,
    autoCloseOnEnded: true,
    updatedAt: new Date(0).toISOString()
  }
};

export async function getBrandSettings(): Promise<BrandSettings> {
  await ensureSettingsFile();
  const stored = await readJson<Partial<BrandSettings>>(settingsPath, defaultSettings);
  return normalizeSettings(stored);
}

export async function saveBrandSettings(input: BrandSettingsInput): Promise<BrandSettings> {
  const current = await getBrandSettings();
  const now = new Date().toISOString();
  const next = normalizeSettings({
    ...current,
    ...input,
    videoPopup: {
      ...current.videoPopup,
      ...input.videoPopup,
      updatedAt: input.videoPopup ? now : current.videoPopup.updatedAt
    },
    updatedAt: now
  });
  await writeJson(settingsPath, next);
  return next;
}

export async function saveVideoPopupSettings(input: VideoPopupSettingsInput): Promise<VideoPopupSettings> {
  const current = await getBrandSettings();
  const now = new Date().toISOString();
  const nextVideoPopup = normalizeVideoPopup({
    ...current.videoPopup,
    ...input,
    updatedAt: now
  });
  await saveBrandSettings({ videoPopup: nextVideoPopup });
  return nextVideoPopup;
}

export async function getPublicVideoPopupSettings(customerSegment?: string): Promise<PublicVideoPopupSettings> {
  const settings = await getBrandSettings();
  return {
    ...settings.videoPopup,
    ...(customerSegment ? { customerSegment } : {})
  };
}

export async function saveUploadedBrandFile(file: File, purpose: string): Promise<string> {
  if (file.size === 0) {
    throw new Error("Dosya bos.");
  }

  const extension = extensionFor(file);
  const safePurpose = slugify(purpose || "brand");
  const fileName = `${safePurpose}-${Date.now()}${extension}`;
  await mkdir(publicBrandDir, { recursive: true });
  await writeFile(path.join(publicBrandDir, fileName), Buffer.from(await file.arrayBuffer()));
  return `/uploads/brand/${fileName}`;
}

function normalizeSettings(value: BrandSettingsInput): BrandSettings {
  return {
    ...defaultSettings,
    ...value,
    siteName: clean(value.siteName) || defaultSettings.siteName,
    siteTitle: clean(value.siteTitle) || defaultSettings.siteTitle,
    tagline: clean(value.tagline) || defaultSettings.tagline,
    headerLogoUrl: clean(value.headerLogoUrl) || defaultSettings.headerLogoUrl,
    mobileLogoUrl: clean(value.mobileLogoUrl) || clean(value.headerLogoUrl) || defaultSettings.mobileLogoUrl,
    footerLogoUrl: clean(value.footerLogoUrl) || clean(value.headerLogoUrl) || defaultSettings.footerLogoUrl,
    adminLogoUrl: clean(value.adminLogoUrl) || clean(value.headerLogoUrl) || defaultSettings.adminLogoUrl,
    faviconUrl: clean(value.faviconUrl) || clean(value.headerLogoUrl) || defaultSettings.faviconUrl,
    updatedAt: clean(value.updatedAt) || new Date().toISOString(),
    videoPopup: normalizeVideoPopup(value.videoPopup ?? defaultSettings.videoPopup)
  };
}

function normalizeVideoPopup(value: VideoPopupSettingsInput): VideoPopupSettings {
  const frequency = toFrequency(value.frequency);
  return {
    ...defaultSettings.videoPopup,
    ...value,
    enabled: Boolean(value.enabled),
    title: clean(value.title) || defaultSettings.videoPopup.title,
    description: clean(value.description),
    videoUrl: clean(value.videoUrl) || defaultSettings.videoPopup.videoUrl,
    posterUrl: clean(value.posterUrl),
    ctaText: clean(value.ctaText),
    ctaHref: clean(value.ctaHref) || "/catalog",
    frequency,
    startsAt: clean(value.startsAt),
    endsAt: clean(value.endsAt),
    showToGuests: value.showToGuests !== false,
    showToCustomers: value.showToCustomers !== false,
    segmentTargets: Array.isArray(value.segmentTargets) ? value.segmentTargets.map(clean).filter(Boolean) : [],
    closeOnOutsideClick: value.closeOnOutsideClick !== false,
    closeOnEsc: value.closeOnEsc !== false,
    autoCloseOnEnded: value.autoCloseOnEnded !== false,
    updatedAt: clean(value.updatedAt) || new Date().toISOString()
  };
}

function toFrequency(value: unknown): VideoPopupFrequency {
  return value === "every_visit" || value === "daily" || value === "weekly" || value === "first_visit" || value === "off" ? value : "first_visit";
}

async function ensureSettingsFile(): Promise<void> {
  if (existsSync(settingsPath)) {
    return;
  }

  await writeJson(settingsPath, {
    ...defaultSettings,
    updatedAt: new Date().toISOString(),
    videoPopup: {
      ...defaultSettings.videoPopup,
      updatedAt: new Date().toISOString()
    }
  });
}

async function readJson<T>(filePath: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await readFile(filePath, "utf8")) as T;
  } catch (error) {
    const code = typeof error === "object" && error !== null && "code" in error ? String(error.code) : "";
    if (code === "ENOENT") {
      return fallback;
    }

    throw error;
  }
}

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  const tmpPath = `${filePath}.${process.pid}.${randomUUID()}.tmp`;
  await writeFile(tmpPath, `${JSON.stringify(value, null, 2)}\n`);
  await rename(tmpPath, filePath);
}

function extensionFor(file: File): string {
  const explicit = path.extname(file.name || "").toLowerCase();
  if (explicit && /^[.][a-z0-9]+$/.test(explicit)) {
    return explicit;
  }

  if (file.type === "image/png") {
    return ".png";
  }

  if (file.type === "image/jpeg") {
    return ".jpg";
  }

  if (file.type === "image/webp") {
    return ".webp";
  }

  if (file.type === "video/mp4") {
    return ".mp4";
  }

  return ".bin";
}

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function slugify(value: string): string {
  return value
    .toLocaleLowerCase("tr-TR")
    .replace(/[ç]/g, "c")
    .replace(/[ğ]/g, "g")
    .replace(/[ı]/g, "i")
    .replace(/[ö]/g, "o")
    .replace(/[ş]/g, "s")
    .replace(/[ü]/g, "u")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function findWorkspaceRoot(startDir: string): string {
  let current = startDir;

  while (current !== path.dirname(current)) {
    if (isWorkspaceRoot(current)) {
      return current;
    }

    current = path.dirname(current);
  }

  return startDir;
}

function isWorkspaceRoot(dir: string): boolean {
  return existsSync(path.join(dir, "pnpm-workspace.yaml")) || existsSync(path.join(dir, "data", "brand-settings.json"));
}
