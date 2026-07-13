import { Film, ImageUp, MonitorPlay, Save, Settings } from "lucide-react";
import { StatusPill } from "@entas/ui";
import { requireAdmin } from "../../../lib/admin-auth";
import { getBrandSettings } from "../../../lib/brand-settings";
import { AdminFrame } from "../AdminFrame";
import { updateBrandSettingsAction, updateVideoPopupSettingsAction } from "./actions";

export const dynamic = "force-dynamic";

const frequencyOptions = [
  { value: "every_visit", label: "Her girişte göster" },
  { value: "daily", label: "Günde 1 kez göster" },
  { value: "weekly", label: "Haftada 1 kez göster" },
  { value: "first_visit", label: "Sadece ilk ziyarette göster" },
  { value: "off", label: "Tamamen kapalı" }
];

const segmentOptions = [
  { value: "standard", label: "Standart bayi" },
  { value: "industrial", label: "Sanayi bayi" },
  { value: "project", label: "Proje bayi" }
];

export default async function AdminSettingsPage() {
  await requireAdmin();
  const settings = await getBrandSettings();

  return (
    <AdminFrame active="settings">
      <header className="adminTopbar">
        <div>
          <span>Marka ayarları</span>
          <h1>Logo, favicon ve video popup merkezi</h1>
        </div>
        <div className="adminTopActions">
          <StatusPill tone={settings.videoPopup.enabled ? "success" : "warning"}>{settings.videoPopup.enabled ? "Popup aktif" : "Popup pasif"}</StatusPill>
          <a className="btn btnGhost dark" href="/api/public/video-popup">
            Public ayarı gör
          </a>
        </div>
      </header>

      <section className="adminGrid settingsGrid">
        <form className="panel wide adminSettingsForm" action={updateBrandSettingsAction}>
          <div className="panelHeader">
            <div>
              <h2>Marka kimliği</h2>
              <p>Header, mobil, footer ve admin giriş logoları bu merkezden yönetilir.</p>
            </div>
            <ImageUp size={22} aria-hidden="true" />
          </div>
          <div className="brandPreview">
            <img src={settings.headerLogoUrl} alt={settings.siteTitle} />
            <div>
              <strong>{settings.siteTitle}</strong>
              <span>{settings.tagline}</span>
            </div>
          </div>
          <div className="adminFormGrid">
            <label>
              Kısa marka adı
              <input name="siteName" defaultValue={settings.siteName} />
            </label>
            <label>
              Site başlığı
              <input name="siteTitle" defaultValue={settings.siteTitle} />
            </label>
            <label className="wideField">
              Slogan
              <input name="tagline" defaultValue={settings.tagline} />
            </label>
            <label>
              Header logo URL
              <input name="headerLogoUrl" defaultValue={settings.headerLogoUrl} />
            </label>
            <label>
              Header logo yükle
              <input name="headerLogo" type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" />
            </label>
            <label>
              Mobil logo URL
              <input name="mobileLogoUrl" defaultValue={settings.mobileLogoUrl} />
            </label>
            <label>
              Mobil logo yükle
              <input name="mobileLogo" type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" />
            </label>
            <label>
              Footer logo URL
              <input name="footerLogoUrl" defaultValue={settings.footerLogoUrl} />
            </label>
            <label>
              Footer logo yükle
              <input name="footerLogo" type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" />
            </label>
            <label>
              Admin logo URL
              <input name="adminLogoUrl" defaultValue={settings.adminLogoUrl} />
            </label>
            <label>
              Admin logo yükle
              <input name="adminLogo" type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" />
            </label>
            <label>
              Favicon URL
              <input name="faviconUrl" defaultValue={settings.faviconUrl} />
            </label>
            <label>
              Favicon yükle
              <input name="favicon" type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" />
            </label>
          </div>
          <div className="formActions">
            <button className="btn btnPrimary" type="submit">
              <Save size={17} aria-hidden="true" />
              Markayı Kaydet
            </button>
          </div>
        </form>

        <form className="panel adminSettingsForm" action={updateVideoPopupSettingsAction}>
          <div className="panelHeader compact">
            <h2>Video popup</h2>
            <MonitorPlay size={22} aria-hidden="true" />
          </div>
          <div className="videoSettingsPreview">
            <video src={settings.videoPopup.videoUrl} poster={settings.videoPopup.posterUrl || undefined} controls preload="metadata" />
          </div>
          <label className="toggleLine">
            <input name="enabled" type="checkbox" defaultChecked={settings.videoPopup.enabled} />
            Popup aktif
          </label>
          <label>
            Başlık
            <input name="title" defaultValue={settings.videoPopup.title} />
          </label>
          <label>
            Açıklama
            <textarea name="description" defaultValue={settings.videoPopup.description} />
          </label>
          <label>
            Video URL
            <input name="videoUrl" defaultValue={settings.videoPopup.videoUrl} />
          </label>
          <label>
            Video dosyası yükle
            <input name="videoFile" type="file" accept="video/mp4,video/webm" />
          </label>
          <label>
            Kapak görseli URL
            <input name="posterUrl" defaultValue={settings.videoPopup.posterUrl} />
          </label>
          <label>
            Kapak görseli yükle
            <input name="posterFile" type="file" accept="image/png,image/jpeg,image/webp" />
          </label>
          <label>
            CTA metni
            <input name="ctaText" defaultValue={settings.videoPopup.ctaText} />
          </label>
          <label>
            CTA linki
            <input name="ctaHref" defaultValue={settings.videoPopup.ctaHref} />
          </label>
          <label>
            Tekrar gösterim
            <select name="frequency" defaultValue={settings.videoPopup.frequency}>
              {frequencyOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <div className="adminFormGrid one">
            <label>
              Başlangıç tarihi
              <input name="startsAt" type="datetime-local" defaultValue={toDateInput(settings.videoPopup.startsAt)} />
            </label>
            <label>
              Bitiş tarihi
              <input name="endsAt" type="datetime-local" defaultValue={toDateInput(settings.videoPopup.endsAt)} />
            </label>
          </div>
          <div className="checkboxStack">
            <label>
              <input name="showToGuests" type="checkbox" defaultChecked={settings.videoPopup.showToGuests} />
              Giriş yapmamış ziyaretçilere göster
            </label>
            <label>
              <input name="showToCustomers" type="checkbox" defaultChecked={settings.videoPopup.showToCustomers} />
              Bayilere göster
            </label>
            <label>
              <input name="closeOnOutsideClick" type="checkbox" defaultChecked={settings.videoPopup.closeOnOutsideClick} />
              Dış tıklama ile kapansın
            </label>
            <label>
              <input name="closeOnEsc" type="checkbox" defaultChecked={settings.videoPopup.closeOnEsc} />
              ESC ile kapansın
            </label>
            <label>
              <input name="autoCloseOnEnded" type="checkbox" defaultChecked={settings.videoPopup.autoCloseOnEnded} />
              Video bitince otomatik kapansın
            </label>
          </div>
          <div className="segmentPicker">
            <strong>Bayi segmentleri</strong>
            {segmentOptions.map((segment) => (
              <label key={segment.value}>
                <input name="segmentTargets" type="checkbox" value={segment.value} defaultChecked={settings.videoPopup.segmentTargets.includes(segment.value)} />
                {segment.label}
              </label>
            ))}
          </div>
          <div className="formActions">
            <button className="btn btnPrimary" type="submit">
              <Film size={17} aria-hidden="true" />
              Popup Ayarını Kaydet
            </button>
          </div>
        </form>

        <div className="panel">
          <div className="panelHeader compact">
            <h2>Davranış özeti</h2>
            <Settings size={20} aria-hidden="true" />
          </div>
          <div className="behaviorList">
            <div>
              <strong>Gösterim kuralı</strong>
              <span>{frequencyOptions.find((option) => option.value === settings.videoPopup.frequency)?.label ?? settings.videoPopup.frequency}</span>
            </div>
            <div>
              <strong>Kapanış</strong>
              <span>
                {settings.videoPopup.closeOnEsc ? "ESC aktif" : "ESC kapalı"} · {settings.videoPopup.closeOnOutsideClick ? "Dış tıklama aktif" : "Dış tıklama kapalı"}
              </span>
            </div>
            <div>
              <strong>Hedef</strong>
              <span>{settings.videoPopup.segmentTargets.length ? settings.videoPopup.segmentTargets.join(", ") : "Tüm uygun ziyaretçiler"}</span>
            </div>
          </div>
        </div>
      </section>
    </AdminFrame>
  );
}

function toDateInput(value: string): string {
  if (!value) {
    return "";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return date.toISOString().slice(0, 16);
}
