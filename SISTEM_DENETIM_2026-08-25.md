# ENTAŞBURADA — Sistem Denetimi
**Tarih:** 2026-08-25 · **Ortam:** entasburada.com (Render, Frankfurt, Docker, standard plan + 10GB disk)
**Commit:** 214ab4c · **Durum:** Canlı ve sağlıklı (`/api/health` → ok, TTFB ~100-200ms)

---

## 1. KRİTİK — Hemen aksiyon

### 1.1 Admin paneli 2FA'sız çalışıyor
Canlı `/admin/login` sayfasında **doğrulama kodu alanı yok**. Kod şu şekilde:

```
{process.env.ADMIN_TOTP_SECRET ? ( <input name="totp" .../> ) : null}   // page.tsx:38
const totpMatches = totpSecret ? verifyTotp(totpCode, totpSecret) : true; // admin-auth.ts
```

Alan render edilmiyor → **Render panelinde `ADMIN_TOTP_SECRET` tanımlı değil** → TOTP tamamen atlanıyor.

Üstelik admin e-postası HTML kaynağında açıkta:
```
<input name="email" value="admin@entasburada.com"/>
```

**Sonuç:** Katalog, fiyat, sipariş, teklif, müşteri hesapları ve cari bakiyelerin tamamını yöneten panelin tek savunması bir paroladır ve kullanıcı adı herkese açıktır. Hız sınırı (8 deneme / 15 dk / IP) yavaşlatır, engellemez.

**Çözüm:** Kod zaten hazır. Render panelinden `ADMIN_TOTP_SECRET` (base32) girmek yeterli. Ek olarak login formundaki `defaultValue={getAdminEmail()}` kaldırılmalı.

### 1.2 Otomatik yedekleme yok
Tüm iş verisi tek bir Render diskinde (`/var/data`): `catalog-store.json` (26MB), siparişler, teklifler, müşteri hesapları, cari defter, 213MB+ ürün görseli.

- `deploy/backup.sh` **eski VPS'e göre yazılmış** (`/opt/entasburada`, `/var/backups`) — Render'da hiç çalışmıyor.
- `render.yaml`'da cron job veya disk snapshot tanımı **yok**.

**Sonuç:** Disk kaybı / bozulma = kurtarılamaz veri kaybı. Veritabanı yok, JSON dosya deposu var; tek kopya.

**Çözüm:** Render Cron Job + off-site hedef (S3/R2/Backblaze), günlük, 14-30 gün saklama.

---

## 2. ORTA — Katalog veri kalitesi

Canlı katalogdan 7.561 ürünün tamamı çekilip analiz edildi.

| Bulgu | Adet | Detay |
|---|---|---|
| Jenerik depo fotoğrafı gösteren ürün | **176** | Tümü EUROMIX; `imageUrl = /images/industrial-hero.png` (sitenin hero görseli). Görsel olarak doğrulandı: "HAVLUPAN ASKILIK" sayfasında havlupan yerine depo fotoğrafı çıkıyor. |
| Kopya ürün (aynı marka + aynı ad) | **233** (93 grup) | Örn. `KFK-019-KB831` ve `KFK-019-KB831-2` ikisi de yayında. |
| "-2" son ekli OCR kopyası | **74** | Euromix portal aktarımından kalan yinelemeler. |
| Yanlış etiketli ürün | **11** | SKU `...-KUTULU` ama ürün adı "(Kutusuz)". Örn. `KFK-037-KE001-KUTULU` → "Kare El Duşu (Kutusuz)". |
| Yinelenen SKU | 30 | |
| Fiyatsız yayında (CONTACT_REP) | 391 | PİMTAŞ 124, LAMINDOOR 117, KF 54, MRSMAX 43, FLOORPAN 33, SAYIM 14, TPS 6. |
| Dış sunucuya bağımlı görsel | 1.715 | bayi.euro-mix.com.tr (1.666) + mir-san.com.tr (49). Şu an erişilebilir, ancak hotlink — o siteler kapanırsa görseller kaybolur. |

**Marka normalizasyonu:**
- `DOĞAL PLASTİK` (50) ve `Doğal Plastik` (24) → filtrede iki ayrı marka olarak görünüyor.
- `Marka Bekliyor` → 170 ürün (yer tutucu, müşteriye görünüyor).
- `SAYIM` → 278 ürün (iç kaynak adı, marka değil).

**Stok beyanı:** 7.561 ürünün tamamı "Stokta var" gösteriliyor (`stockPolicy: all_active_products_in_stock`). Ürün açıklamalarında "teyit gerekli" notu var; yine de ticari/hukuki açıdan gözden geçirilmeli.

---

## 3. ORTA — Altyapı

### 3.1 Diskte yedek birikmesi (temizlik yok)
`scripts/set-supplier-status.ts:71` her çalıştığında catalog-store'un tam kopyasını (26MB) diske yazıyor. `deploy/supplier-status-releases/` altında 10 sürüm var → ~260MB. Retention politikası yok, her yeni sürümle büyüyor. Görsel normalizasyon da `image-backups/<sürüm>` altına orijinallerin tam kopyasını alıyor.

### 3.2 Bağımlılık açıkları
```
[HIGH]     nanoid  <3.3.16  → sonsuz döngü (negatif size)
[HIGH]     nanoid  <3.3.18  → sonsuz döngü (size=0)
[HIGH]     deepmerge-ts <8  → yığın tükenmesi (özyinelemeli nesne)
[MODERATE] postcss <=8.5.22 → sourceMappingURL ile keyfi .map okuma
```
Hepsi transitif (next→postcss→nanoid, prisma→@prisma/config→deepmerge-ts). Çalışma zamanı riski düşük — build zamanı araçları. Next.js 16.2.11 güncellemesi ile kapanır.

### 3.3 Ölü kod imajda taşınıyor
- `apps/admin` — tek `page.tsx`'lik taslak. Gerçek admin `apps/web/app/admin` altında.
- `apps/worker` — bullmq + ioredis kullanıyor ama `render.yaml`'da Redis yok, servis deploy edilmiyor.
- `packages/database` — Prisma hiçbir yerde kullanılmıyor (`apps/web` tamamen JSON deposu). Yine de kuruluyor, build süresini ve `deepmerge-ts` açığını getiriyor.

### 3.4 Açılışta yapılan iş
`docker-entrypoint.sh` her açılışta katalog sürümlerini, tedarikçi durumlarını, görsel normalizasyonunu (marker korumalı) ve **her seferinde** `catalog:reclassify --write` çalıştırıyor. Deploy sırasındaki ~1 dk kesintinin kaynağı bu.

---

## 4. DÜŞÜK

- **SEO:** canonical etiketi yok, `og:image` yok, **JSON-LD Product şeması yok**. 7.561 ürün için Google zengin sonuçları kaybediliyor. `twitter:card` var.
- **Video popup "ilk ziyaret" sızıntısı:** `firstShownAt` yalnızca video `onPlaying` olayında yazılıyor; video ise kullanıcı tıklamadan başlamıyor. Kullanıcı X'e basmadan/dışarı tıklamadan çıkarsa (sekme kapatma, geri tuşu) hiçbir şey kaydedilmiyor → popup her ziyarette tekrar açılıyor. (`VideoPopup.tsx:228`)
- **`/api/products` hız sınırsız:** limit 100'e sabitlenmiş ama 76 istekle tüm katalog çekilebiliyor. Fiyatlar bayi onayına kilitli olduğu için etki sınırlı; yine de rakip ürün/SKU listesini alabilir.
- **ZiraatPay:** `requireEnv` ile fail-closed; mod `ZIRAATPAY_MODE === "prod"` değilse "test". Dışarıdan canlı mod doğrulanamadı — kimlik bilgilerinin girilip girilmediği teyit edilmeli.

---

## 5. DOĞRU ÇALIŞAN — Denetimde teyit edildi

**Güvenlik**
- CSP, HSTS, X-Frame-Options: DENY, COOP/CORP, Permissions-Policy, nosniff — hepsi canlıda aktif.
- 24 admin API ucunun **tamamı** `isAdminAuthenticated` kontrollü. Yetkisiz istek → 401.
- `proxy.ts`: cross-site istek reddi, origin doğrulama, `Content-Length` zorunluluğu, yol bazlı gövde limitleri. Ödeme callback'i bilinçli ve gerekçeli istisna (kendi imza doğrulaması var).
- `uploads` rotası: `path.normalize` + prefix kontrolü + `realpath` ile symlink kaçışı kapalı, content-type beyaz listesi, PDF için `attachment` + sandbox CSP.
- Oturum: `__Host-` çerez öneki, HMAC imzalı token, sabit zamanlı karşılaştırma, 8 saat ömür.
- Hız sınırlama: admin/müşteri girişi, TOTP replay, bayi başvurusu, teklif, ödeme başlatma, analitik olayları.
- Repoda sızmış secret yok; `.gitignore` kapsamlı (`data/*.json`, `.env.*`, uploads, PDF kaynakları).

**Doğruluk**
- Ödeme callback'i: imza doğrulama → sipariş bulma → idempotent güncelleme. İmza tutmazsa hiçbir şey değişmiyor.
- Kur çevrimi (`fx.ts`): TCMB alınamazsa **hata fırlatıyor**, eski/tahmini kurla tahsilat yapmıyor. (TCMB şu an erişilebilir: USD satış 48,0982)
- JSON yazımları atomik (tmp + rename), ticari mutasyonlar sıraya alınmış, hız sınırı deposu dosya kilidiyle korunuyor.
- Bakiye ödemesi: origin + auth + hız sınırı + katı tutar doğrulama (regex + kuruş kontrolü) + sağlayıcı bağlama doğrulaması.

**Kalite**
- 124 test / 20 dosya — tamamı geçiyor. Typecheck 13 paket temiz.
- Performans: `/` 296ms, `/catalog` 670ms (868KB HTML → 145KB sıkıştırılmış), ürün sayfası 206ms.
- Mobil uyumlu; carousel/sekme/buton aria etiketleri yerinde. Konsol hatası yok.

---

## 6. Önerilen sıra

1. Render'da `ADMIN_TOTP_SECRET` gir → admin 2FA aç *(dakikalar)*
2. Login formundan admin e-postası ön dolgusunu kaldır *(dakikalar)*
3. Render Cron Job ile günlük off-site yedek kur *(saatler)*
4. 176 EUROMIX placeholder görselini gerçek ürün fotoğraflarıyla değiştir veya bu ürünleri pasife al
5. 233 kopya ürünü ve 11 yanlış etiketli ürünü temizle (supplier-status release ile)
6. Marka adlarını normalize et; "Marka Bekliyor" / "SAYIM" ürünlerine gerçek marka ata
7. Next.js güncelle → bağımlılık açıkları kapansın
8. Ölü paketleri kaldır (apps/admin, apps/worker, packages/database)
9. Ürün sayfalarına JSON-LD + canonical + og:image ekle
10. Disk yedek dosyalarına retention politikası
