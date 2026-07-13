"use server";

import { revalidatePath } from "next/cache";
import { getAdminEmail, requireAdmin } from "../../../lib/admin-auth";
import { getBrandSettings, saveBrandSettings, saveUploadedBrandFile, saveVideoPopupSettings } from "../../../lib/brand-settings";
import type { VideoPopupFrequency } from "../../../lib/video-popup-policy";

export async function updateBrandSettingsAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const current = await getBrandSettings();
  const headerLogo = await uploadedUrl(formData, "headerLogo", "header-logo");
  const mobileLogo = await uploadedUrl(formData, "mobileLogo", "mobile-logo");
  const footerLogo = await uploadedUrl(formData, "footerLogo", "footer-logo");
  const adminLogo = await uploadedUrl(formData, "adminLogo", "admin-logo");
  const favicon = await uploadedUrl(formData, "favicon", "favicon");

  await saveBrandSettings({
    siteName: getString(formData, "siteName") || current.siteName,
    siteTitle: getString(formData, "siteTitle") || current.siteTitle,
    tagline: getString(formData, "tagline") || current.tagline,
    headerLogoUrl: headerLogo || getString(formData, "headerLogoUrl") || current.headerLogoUrl,
    mobileLogoUrl: mobileLogo || getString(formData, "mobileLogoUrl") || current.mobileLogoUrl,
    footerLogoUrl: footerLogo || getString(formData, "footerLogoUrl") || current.footerLogoUrl,
    adminLogoUrl: adminLogo || getString(formData, "adminLogoUrl") || current.adminLogoUrl,
    faviconUrl: favicon || getString(formData, "faviconUrl") || current.faviconUrl
  });

  revalidateSettings();
}

export async function updateVideoPopupSettingsAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const current = (await getBrandSettings()).videoPopup;
  const videoUrl = await uploadedUrl(formData, "videoFile", "video-popup");
  const posterUrl = await uploadedUrl(formData, "posterFile", "video-poster");

  await saveVideoPopupSettings({
    enabled: formData.get("enabled") === "on",
    title: getString(formData, "title") || current.title,
    description: getString(formData, "description"),
    videoUrl: videoUrl || getString(formData, "videoUrl") || current.videoUrl,
    posterUrl: posterUrl || getString(formData, "posterUrl"),
    ctaText: getString(formData, "ctaText"),
    ctaHref: getString(formData, "ctaHref") || "/catalog",
    frequency: toFrequency(getString(formData, "frequency")),
    startsAt: getString(formData, "startsAt"),
    endsAt: getString(formData, "endsAt"),
    showToGuests: formData.get("showToGuests") === "on",
    showToCustomers: formData.get("showToCustomers") === "on",
    segmentTargets: formData.getAll("segmentTargets").map(String).filter(Boolean),
    closeOnOutsideClick: formData.get("closeOnOutsideClick") === "on",
    closeOnEsc: formData.get("closeOnEsc") === "on",
    autoCloseOnEnded: formData.get("autoCloseOnEnded") === "on"
  });

  revalidateSettings();
}

async function uploadedUrl(formData: FormData, field: string, purpose: string): Promise<string> {
  const file = formData.get(field);
  if (!(file instanceof File) || file.size === 0) {
    return "";
  }

  return saveUploadedBrandFile(file, `${purpose}-${getAdminEmail()}`);
}

function revalidateSettings(): void {
  revalidatePath("/");
  revalidatePath("/admin");
  revalidatePath("/admin/settings");
  revalidatePath("/admin/login");
}

function getString(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function toFrequency(value: string): VideoPopupFrequency {
  return value === "every_visit" || value === "daily" || value === "weekly" || value === "first_visit" || value === "off" ? value : "first_visit";
}
