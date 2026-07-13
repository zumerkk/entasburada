# Video Popup Implementation

## Durum

Logo, favicon referansı ve giriş video popup akışı eklendi.

## Dosyalar

- `apps/web/lib/brand-settings.ts`
- `apps/web/lib/video-popup-policy.ts`
- `apps/web/components/VideoPopup.tsx`
- `apps/web/app/api/public/video-popup/route.ts`
- `apps/web/app/api/admin/settings/video-popup/route.ts`
- `apps/web/app/admin/settings/page.tsx`
- `data/brand-settings.json`
- `apps/web/public/brand/entas-logo.png`
- `apps/web/public/brand/entas-intro.mp4`

## Özellikler

- Header, footer ve admin login gerçek logo ayarından beslenir.
- Popup public API üzerinden ayar okur.
- Gösterim sıklığı: her giriş, günlük, haftalık, ilk ziyaret, kapalı.
- LocalStorage ile rahatsız etmeme kuralı uygulanır.
- ESC, dış tıklama, CTA, poster, auto close ve segment ayarları vardır.
- Admin panelden logo/video/popup ayarları değiştirilebilir.

## Test

- `pnpm --filter @entas/web test`
- `pnpm --filter @entas/web build`
- `GET /api/public/video-popup` 200 ve aktif ayar döndü.
