# ENTASBURADA — Render ile Canlıya Alma (Aşama 1, Docker + Kalıcı Disk)

Mimari: Render Web Service (Docker) + 10 GB kalıcı disk (`/var/data`).
`data/*.json` ve ürün görselleri diskte yaşar; deploy'lar veriye dokunmaz.
SSL ve domain yönetimi Render tarafından otomatik yapılır.

## Neden bu şartlar?

- **Kalıcı disk olmadan OLMAZ:** sipariş/sepet/müşteri verisi ve 114 MB ürün görseli
  her deploy'da silinirdi.
- **Docker:** admin panelden PDF katalog import'u poppler + pdfplumber ister;
  Render'ın standart Node ortamında bunlar yok.
- **Standard plan (2 GB RAM):** katalog deposu 11 MB JSON; 512 MB'lık Starter yetmez.

Tahmini maliyet: Standard ~$25/ay + disk ~$2.50/ay.

## Adımlar

### 1. Kodu GitHub'a gönder

```bash
git add -A && git commit -m "Asama 1: go-live hazirligi" && git push origin main
```

### 2. Render'da Blueprint ile servis aç

Render Dashboard → New → **Blueprint** → `zumerkk/entasburada` reposunu seç.
`render.yaml` otomatik okunur (Docker servis + disk + env tanımları).

Alternatif (elle): New → Web Service → repo seç → Runtime: **Docker**,
Plan: **Standard**, Disk ekle: mount path `/var/data`, 10 GB.

### 3. Gizli env değerlerini gir

Render panel → entasburada → Environment. `.env.production.local` dosyasındaki değerleri gir:
`ADMIN_SESSION_SECRET`, `AUTH_SECRET`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`,
`OPENAI_API_KEY`, `GEMINI_API_KEY`.

İlk deploy başlar; bittiğinde site `entasburada.onrender.com`'da açılır
(bu aşamada katalog yalnızca XML kaynaklı ~2.960 ürün gösterir — normal).

### 4. Tam katalog + görselleri diske yükle (tek seferlik)

Render SSH ile (panel → Shell sekmesi ya da [Render CLI](https://render.com/docs/ssh)):

```bash
# lokal makineden (SERVICE_SSH ornegi: srv-xxxx@ssh.frankfurt.render.com):
tar czf - -C data . | ssh SERVICE_SSH "tar xzf - -C /var/data/data"
tar czf - -C apps/web/public/uploads . | ssh SERVICE_SSH "tar xzf - -C /var/data/uploads"
```

Ardından panelden **Restart** — 7.721 ürün görselleriyle yayında olmalı.

### 5. Domain bağla

Render panel → Settings → Custom Domains → `entasburada.com` ve `www.entasburada.com` ekle.
Domain zaten Render'daysa DNS kayıtları otomatik önerilir; SSL otomatik.

### 6. Kontrol listesi

- https://entasburada.com ürün görselleriyle açılıyor mu?
- `/admin` → ADMIN_EMAIL / ADMIN_PASSWORD ile giriş
- Test bayi ile giriş + sepet + teklif akışı
- `/robots.txt` ve `/sitemap.xml`
- Panel → Logs'ta hata var mı?

## Sonraki deploylar

`git push origin main` → otomatik deploy. Disk verisine dokunulmaz.
Not: diskli serviste zero-downtime deploy yoktur; deploy sırasında ~1 dk kesinti olur.

## Yedekleme

Render diskleri otomatik günlük snapshot alır (7 gün saklanır). Ek güvence için
arada bir lokale çekin:

```bash
ssh SERVICE_SSH "tar czf - -C /var/data ." > yedek-$(date +%Y%m%d).tar.gz
```

## Bilinçli sınırlar (Aşama 2'de çözülecek)

- Tek instance; yatay ölçekleme yok (disk tek servise bağlanır).
- E-posta bildirimi yok; siparişleri admin panelden takip edin.
- Canlıya gerçek bayi almadan önce 3 test hesabını kapatın
  (`/var/data/data/customer-accounts.json` → status: suspended).
