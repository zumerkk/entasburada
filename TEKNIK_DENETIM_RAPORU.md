# ENTAŞBURADA - Proje Denetim Raporu (Bölüm 1/4)
## Yönetici Özeti, Proje Envanteri ve Mimari Analiz

---

## A. YÖNETİCİ ÖZETİ

### Projenin Genel Sağlık Durumu
ENTAŞBURADA, B2B hırdavat/yapı market toptan ticaret platformu olarak geliştirilmektedir. Proje, fonksiyonel bir MVP aşamasındadır ancak **kritik mimari kararlar nedeniyle production kullanıma hazır değildir**.

### En Güçlü Yönleri
1. **İyi düşünülmüş iş modeli** — B2B bayi fiyatlandırma, teklif/sipariş akışları, dealer onay süreci
2. **Monorepo yapısı** — pnpm workspace + Turborepo ile iyi organize edilmiş paket yapısı
3. **Fiyatlandırma motoru** — `@entas/pricing-engine` Decimal.js ile doğru para hesaplaması yapıyor
4. **AI katalog import** — PDF'den ürün çıkarma özelliği gelişmiş durumda

### En Kritik Problemler

> [!CAUTION]
> **KRİTİK: Tüm iş verileri JSON dosyalarında tutuluyor.** Prisma schema 1346 satır, 45+ tablo ile profesyonelce tasarlanmış olmasına rağmen, **uygulama Prisma/PostgreSQL'i hiç kullanmıyor**. Tüm müşteri hesapları, teklifler, siparişler, bildirimler, analitik veriler `data/` klasöründeki JSON dosyalarında saklanıyor.

> [!CAUTION]
> **KRİTİK: Güvenlik sızıntısı — Production gizli anahtarları Git'te.** `.env.production.local` ve `.env.local` dosyaları OpenAI API key, SMTP şifresi, admin şifresi, Resend API key gibi tüm sırları açık metin olarak içeriyor ve Git'e commit edilmiş durumda.

> [!WARNING]
> **Admin kimlik doğrulaması son derece zayıf.** Tek admin kullanıcı, şifre env variable'dan okunuyor, session basit bir cookie karşılaştırması (`cookieValue === ADMIN_SESSION_SECRET`). Token rotasyonu, süre dolumu, RBAC yok.

### Canlıya Çıkışa Uygunluk: ❌ HAZIR DEĞİL
### Ölçeklenebilirlik: ❌ JSON dosya sistemi ile ölçeklenemez
### Teknik Borç Seviyesi: 🔴 Yüksek

---

## B. PROJE PUAN KARTI

| Alan | Puan | Gerekçe |
|------|------|---------|
| Mimari | 35/100 | Prisma schema var ama kullanılmıyor; tüm veri JSON dosyalarda |
| Backend | 40/100 | İş mantığı doğru ama DB yok, race condition riski yüksek |
| Frontend | 55/100 | Next.js 16 SSR, düzgün sayfa yapısı ama erişilebilirlik eksik |
| Veritabanı | 15/100 | Schema tasarımı iyi ama hiç bağlanmıyor; fiilen dosya sistemi DB |
| Güvenlik | 20/100 | API key'ler Git'te, admin auth zayıf, IDOR riskleri |
| Performans | 30/100 | 18MB catalog-store.json her istekte okunuyor |
| Ölçeklenebilirlik | 15/100 | JSON dosya + tek process = ölçeklenemez |
| Kod Kalitesi | 50/100 | TypeScript, tutarlı stil ama çok tekrar eden yardımcı fonksiyonlar |
| Test Altyapısı | 25/100 | Vitest var, birkaç unit test ama entegrasyon/e2e yok |
| DevOps | 40/100 | Dockerfile, deploy script var ama CI/CD, staging, monitoring yok |
| Kullanıcı Deneyimi | 50/100 | Temiz UI ama formlar doğrulama geri bildirimi zayıf |
| Dokümantasyon | 35/100 | README var ama API doc, mimari doc yok |
| Bakım Kolaylığı | 35/100 | Tekrar eden kod, findWorkspaceRoot 7+ dosyada kopyalanmış |
| Production Hazırlığı | 20/100 | Secret sızıntısı, DB eksikliği, monitoring yok |

---

## C. PROJE ENVANTERİ

### Teknoloji Yığını
| Katman | Teknoloji |
|--------|-----------|
| Dil | TypeScript, Python (yardımcı scriptler) |
| Framework | Next.js 16 (App Router, SSR) |
| Monorepo | pnpm workspaces + Turborepo |
| Frontend | React 19, Lucide icons, react-hook-form, TanStack Query |
| Backend | Next.js API Routes (App Router) |
| ORM | Prisma 6.14 (şema var, **kullanılmıyor**) |
| Veritabanı (planlanan) | PostgreSQL 16 |
| Veritabanı (fiili) | JSON dosyaları (`data/` klasörü) |
| Queue (planlanan) | BullMQ + Redis |
| Arama (planlanan) | Meilisearch |
| Object Storage (planlanan) | MinIO (S3 uyumlu) |
| AI | OpenAI GPT-5.4-mini, Gemini 3.1 Flash |
| E-posta | Nodemailer (SMTP) + Resend (yedek) |
| Deployment | Render.com (Docker) + VPS (rsync) |
| Fiyatlandırma | Decimal.js tabanlı özel motor |
| XML Import | saxes (SAX parser) |

### Uygulama Yapısı
| Uygulama | Port | Durum |
|----------|------|-------|
| `@entas/web` | 3000 | Ana müşteri + admin paneli (aynı Next.js app) |
| `@entas/admin` | 3001 | Ayrı admin app (boş, kullanılmıyor) |
| `@entas/worker` | — | BullMQ worker (iskelet, gerçek iş yok) |

### Paylaşılan Paketler
| Paket | Durum |
|-------|-------|
| `@entas/database` | Prisma client export ediyor ama hiçbir repository kullanmıyor |
| `@entas/catalog` | ✅ Aktif — ürün sınıflandırma, arama, merge |
| `@entas/pricing-engine` | ✅ Aktif — B2B fiyat hesaplama |
| `@entas/import-engine` | ✅ Aktif — XML import/parse |
| `@entas/auth` | ⚠️ Kısmen — rol/izin tanımları var ama uygulanmıyor |
| `@entas/validation` | ❌ Boş (sadece export) |
| `@entas/notifications` | ❌ Boş (sadece export) |
| `@entas/integrations` | ❌ Boş (sadece export) |
| `@entas/analytics` | ❌ Boş (sadece export) |
| `@entas/ui` | ✅ Aktif — ProductCard, TrustStrip bileşenleri |

### Klasör Yapısı Haritası
```
entasburada/
├── apps/
│   ├── web/           # Ana Next.js uygulaması (müşteri + admin)
│   │   ├── app/       # App Router sayfaları ve API route'ları
│   │   ├── components/# React bileşenleri
│   │   ├── lib/       # ⚠️ Tüm iş mantığı burada (repository'ler)
│   │   └── data/      # Statik veri (katalog tanımları)
│   ├── admin/         # ❌ Boş admin app (kullanılmıyor)
│   └── worker/        # ⚠️ İskelet BullMQ worker
├── packages/          # Paylaşılan paketler (10 adet)
├── data/              # ⚠️ JSON "veritabanı" (~50MB)
├── scripts/           # Import/migration scriptleri (22 dosya)
├── deploy/            # Deployment dosyaları
├── Pdfler/            # PDF katalog kaynakları
└── [çeşitli .md]      # Dokümantasyon/notlar
```

---

## D. İŞ MODELİ ANALİZİ

### Projenin Amacı
B2B hırdavat ve yapı market ürünleri toptan ticaret platformu. Bayilere özel fiyatlandırma ile teklif ve sipariş yönetimi.

### Kullanıcı Rolleri
| Rol | Durum |
|-----|-------|
| Ziyaretçi (anonim) | ✅ Katalog görüntüleme, fiyat gizli |
| Bayi (müşteri) | ✅ Giriş, fiyat görme, sepet, teklif talebi |
| Admin | ✅ Ürün yönetimi, teklif/sipariş operasyonları |
| Satış temsilcisi | ⚠️ Schema'da var ama fiili ayrı arayüz yok |
| Finans görevlisi | ⚠️ Schema'da var ama fiili uygulama yok |
| Depo sorumlusu | ⚠️ Schema'da var ama fiili uygulama yok |

### İş Modeli vs Kod Uyumsuzlukları

| İş Modeli Beklentisi | Kod Durumu |
|----------------------|------------|
| PostgreSQL veritabanı | ❌ JSON dosyaları kullanılıyor |
| Çoklu admin kullanıcı | ❌ Tek admin (env variable) |
| Ödeme sistemi | ❌ Schema'da var, kod yok |
| Fatura sistemi | ❌ Schema'da var, kod yok |
| Stok yönetimi | ❌ Schema'da var, kod yok |
| İade süreci | ❌ Schema'da var, kod yok |
| Destek sistemi | ❌ Schema'da var, kod yok |
| Kredi hesabı | ❌ Schema'da var, kod yok |
| Webhook entegrasyonu | ❌ Schema'da var, kod yok |

---

## E. MİMARİ ANALİZ

### Temel Mimari Sorun: İkili Veri Katmanı

Projede iki ayrı veri dünyası var:

1. **Prisma Schema** (`packages/database/prisma/schema.prisma`) — 1346 satır, 45+ model, enum'lar, ilişkiler, indeksler ile profesyonelce tasarlanmış
2. **JSON Dosya Sistemi** (`apps/web/lib/*-repository.ts`) — Gerçekte kullanılan, dosya bazlı veri depolama

Bu iki dünya **hiç bağlanmıyor**. `@entas/database` paketi Prisma client'ı export ediyor ama hiçbir repository dosyası onu import etmiyor.

### Veri Akışı: Teklif Oluşturma (Uçtan Uca)

```
Müşteri teklif formu doldurur
→ /app/quote/page.tsx (Server Action)
→ createQuote() [commercial-repository.ts]
→ ❌ Server-side validation (sadece temel kontroller)
→ ❌ Authentication (teklif için giriş zorunlu değil)
→ loadCatalogStore() → data/catalog-store.json okuması (18MB)
→ quotes.json dosyasına yazma (atomik rename)
→ createNotification() → notifications.json'a yazma
→ ❌ E-posta gönderimi yok
→ Response → UI güncelleme
```

**Eksik adımlar:**
- CSRF koruması yok
- Rate limiting yok
- Eşzamanlı yazma koruması yok (race condition)
- Transaction desteği yok
- Audit log veritabanına yazılmıyor

### God File Sorunu

`smart-import-repository.ts` — **81.493 byte** (tek dosya)
`catalog-ai-extractor.ts` — **78.254 byte** (tek dosya)
`globals.css` — **81.880 byte** (tek CSS dosyası)

### Tekrar Eden Kod
`findWorkspaceRoot()` fonksiyonu **7+ dosyada** birebir kopyalanmış:
- `customer-auth.ts`
- `commercial-repository.ts`
- `catalog-repository.ts`
- `cart-repository.ts`
- `notification-repository.ts`
- `analytics-repository.ts`
- `dealer-application-repository.ts`

Aynı şekilde `readJson()`, `writeJson()`, `normalize()`, `stripUndefined()`, `clean()` fonksiyonları da her repository'de tekrar ediyor.
# ENTAŞBURADA - Proje Denetim Raporu (Bölüm 2/4)
## Backend, Güvenlik, Kimlik Doğrulama ve Veritabanı Analizi

---

## F. BACKEND ANALİZİ

### API Endpoint Envanteri

| Method | Path | Amaç | Auth | Sorun |
|--------|------|------|------|-------|
| GET | `/api/health` | Sağlık kontrolü | ❌ Yok | Katalog istatistiklerini herkese açıyor |
| GET | `/api/products` | Ürün arama | ❌ Yok | Fiyat bilgisi dönmüyor — doğru |
| GET | `/api/quotes` | Teklif takip | ❌ Yok | trackingCode ile sorgulama — IDOR riski |
| POST | `/api/quotes` | Teklif oluştur | ❌ Yok | Rate limit yok |
| GET | `/api/cart` | Sepet getir | ✅ Müşteri | — |
| POST | `/api/cart` | Sepete ekle | ✅ Müşteri | — |
| POST | `/api/cart/checkout` | Sipariş oluştur | ✅ Müşteri | — |
| GET | `/api/orders` | Sipariş takip | ❌ Yok | trackingCode ile — IDOR riski |
| GET | `/api/admin/quotes` | Admin teklifler | ✅ Admin | — |
| POST | `/api/admin/quotes` | Teklif işlem | ✅ Admin | — |
| GET | `/api/admin/orders` | Admin siparişler | ✅ Admin | — |
| POST | `/api/admin/orders` | Sipariş güncelle | ✅ Admin | — |
| GET | `/api/admin/products` | Admin ürünler | ✅ Admin | — |
| POST | `/api/admin/import/*` | İmport işlemleri | ✅ Admin | — |
| GET | `/api/admin/analytics/*` | Analitik raporlar | ✅ Admin | — |
| POST | `/api/admin/dealers/accounts` | Bayi hesap oluştur | ✅ Admin | — |
| POST | `/api/events/*` | Analitik olaylar | ❌ Yok | Sahte olay gönderimi engellenmiyor |

### İş Mantığı Sorunları

**Bulgu: Race Condition — Eşzamanlı JSON Yazma**
- **Risk:** Kritik
- **Dosya:** Tüm `*-repository.ts` dosyaları
- **Durum:** İki eşzamanlı istek aynı JSON dosyasını okur, değiştirir ve yazar. İkinci yazma birincinin değişikliklerini siler.
- **Etki:** Teklif kaybı, sipariş kaybı, sepet verisi kaybı
- **Senaryo:** İki müşteri aynı anda teklif oluşturursa biri kaybolabilir.

**Bulgu: Para Hesaplaması Floating-Point Riski**
- **Risk:** Orta
- **Dosya:** `commercial-repository.ts` satır 833-837, `customer-pricing.ts`
- **Durum:** `parseMoney()` ve `money()` fonksiyonları JavaScript `Number` ile çalışıyor. Pricing engine doğru olarak `Decimal.js` kullanıyor ama repository katmanı kullanmıyor.
- **Etki:** Kuruş düzeyinde yuvarlama hataları

**Bulgu: Katalog Store Her İstekte Okunuyor**
- **Risk:** Yüksek
- **Dosya:** `catalog-repository.ts` satır 116-142
- **Durum:** `catalog-store.json` 18MB boyutunda. Cache mekanizması mtime kontrolü ile var ama her fonksiyon çağrısında `stat()` + potansiyel `readFile()` + `JSON.parse()` yapılıyor.
- **Etki:** Yüksek CPU ve bellek tüketimi, yavaş yanıt süreleri

### Validation Eksiklikleri

- Server-side validation minimal: Sadece temel alan uzunluk kontrolleri (`companyTitle.length < 2`)
- Dosya yükleme validasyonu: MIME type kontrolü yok (AI import PDF için)
- Request body tip doğrulaması: `as` type assertion kullanılıyor, Zod schema yok
- Örnek: `apps/web/app/api/admin/orders/route.ts` satır 35: `const body = (await request.json()) as {...}` — herhangi bir veri kabul edilir

### Hata Yönetimi

- Merkezi hata yönetimi **yok**
- API route'larda catch blokları error mesajını doğrudan döndürüyor: `error instanceof Error ? error.message : "..."` — stack trace sızma riski düşük ama hata kodları tutarsız
- JSON dosya bozulması durumunda `salvageJsonArrayPrefix()` ile kurtarma denemesi var (analytics) — iyi bir savunma
- Timeout yönetimi yok (harici API çağrıları için)

---

## G. GÜVENLİK DENETİMİ

### Bulgu 1: Production Sırları Git'te Açık
- **Risk:** 🔴 Kritik
- **Güven:** Kesin tespit
- **Dosya:** `.env.production.local`, `apps/web/.env.local`
- **Sızan bilgiler:**
  - OpenAI API Key: `sk-proj-BLxx...` (tam key)
  - Gemini API Key: `AQ.Ab8R...` (tam key)
  - Admin şifresi: `-nsZACgI9LZpI2dt_0k6TnOA`
  - SMTP şifresi: `kshpsxfaqlcicfig`
  - Resend API Key: `re_YF9F...`
  - Auth secret, admin session secret
- **Etki:** Tüm API anahtarları ele geçirilebilir, admin paneline erişilebilir, e-posta gönderilebilir
- **Çözüm:** Tüm anahtarları derhal iptal edip yenilerini oluşturun. `.env*.local` dosyalarını `.gitignore`'a ekleyin. Git geçmişinden BFG Repo-Cleaner ile temizleyin.
- **Öncelik:** ACİL — bugün yapılmalı

### Bulgu 2: Admin Auth Zayıf Tasarım
- **Risk:** 🔴 Kritik
- **Dosya:** `apps/web/lib/admin-auth.ts`
- **Durum:** Admin session doğrulaması `cookieValue === ADMIN_SESSION_SECRET` karşılaştırmasıdır. Bu demektir ki:
  - Session expire olmaz (süresiz)
  - Çıkış yapma fiilen imkansız (cookie silinse bile secret değişmez)
  - Timing-safe karşılaştırma yok (müşteri auth'ta var ama admin'de yok)
  - Brute-force koruması yok
  - Tek admin kullanıcı, RBAC yok
- **Çözüm:** JWT veya signed session token'a geçiş, süre sınırı, logout desteği

### Bulgu 3: IDOR — Teklif ve Sipariş Takip Kodları
- **Risk:** 🟠 Yüksek
- **Dosya:** `apps/web/app/api/quotes/route.ts`, `apps/web/app/api/orders/route.ts`
- **Durum:** Teklif ve sipariş takip kodları UUID'nin ilk 8 karakteri (`T` + 8 hex). Auth olmadan erişilebilir. Brute-force ile tahmin edilebilir.
- **Etki:** Herhangi biri başka bir firmanın teklif/sipariş detaylarını görebilir
- **Çözüm:** Daha uzun tracking code veya auth zorunlu kılma

### Bulgu 4: CSRF Koruması Yok
- **Risk:** 🟠 Yüksek
- **Dosya:** Tüm POST API route'ları
- **Durum:** CSRF token kontrolü yapılmıyor. `SameSite` cookie ayarı da açıkça belirtilmemiyor.
- **Etki:** Cross-site request ile admin işlemleri tetiklenebilir

### Bulgu 5: Rate Limiting Yok
- **Risk:** 🟡 Orta
- **Dosya:** Tüm API route'ları
- **Durum:** Hiçbir endpoint'te rate limiting uygulanmıyor.
- **Etki:** Brute-force saldırıları, DoS, teklif spam'ı

### Bulgu 6: Harici Servis Çağrılarında Güvenlik
- **Risk:** 🟡 Orta
- **Dosya:** `apps/web/lib/remote-xml.ts`, `apps/web/lib/catalog-ai-extractor.ts`
- **Durum:** XML import için `XML_IMPORT_ALLOWED_HOSTS` kontrolü var (iyi). AI çağrılarında prompt injection koruması minimal.

### Bulgu 7: Güvenlik Header'ları Eksik
- **Risk:** 🟡 Orta
- **Durum:** `next.config.ts`'de security header'lar tanımlı değil. `X-Frame-Options`, `X-Content-Type-Options`, `Strict-Transport-Security`, `Content-Security-Policy` eksik.

---

## H. KİMLİK DOĞRULAMA VE YETKİLENDİRME

### Müşteri Auth Sistemi
- **Dosya:** `apps/web/lib/customer-auth.ts`, `session-token.ts`, `password-hash.ts`
- Scrypt hash (✅ iyi) + legacy düz metin şifre geçişi (✅ iyi tasarım)
- HMAC-SHA256 session token + timing-safe karşılaştırma (✅)
- 14 gün session süresi (✅)
- **Ancak:** Müşteri verileri JSON dosyasında saklanıyor; dosya kilidi yok

### Admin Auth Sistemi
- **Dosya:** `apps/web/lib/admin-auth.ts`
- Tek kullanıcı, env variable'dan okunan şifre
- Cookie değeri = `ADMIN_SESSION_SECRET` sabit değer karşılaştırması
- **Zayıflıklar:** Süresiz session, timing-safe karşılaştırma yok, logout yok, MFA yok

### Yetkilendirme Kontrol Noktaları
| Seviye | Müşteri | Admin |
|--------|---------|-------|
| Frontend (buton gizleme) | ✅ | ✅ |
| API route | ✅ `getCurrentCustomer()` | ✅ `isAdminAuthenticated()` |
| Service/Repository | ❌ | ❌ |
| Veritabanı sorgusu | N/A (JSON) | N/A (JSON) |

**Sorun:** Yetkilendirme yalnızca API route seviyesinde yapılıyor. Repository fonksiyonları herhangi bir yetki kontrolü içermiyor. `@entas/auth` paketindeki `can()` fonksiyonu hiçbir yerde çağrılmıyor.

---

## I. VERİTABANI ANALİZİ

### Fiili Durum: JSON Dosya Sistemi

| Dosya | Boyut | İçerik |
|-------|-------|--------|
| `catalog-store.json` | 18.2 MB | Tüm ürün kataloğu |
| `ai-import-jobs.json` | 31.8 MB | AI import iş kayıtları |
| `user-events.json` | 26 KB | Analitik olaylar |
| `customer-accounts.json` | 4.4 KB | Müşteri hesapları |
| `quotes.json` | 1.7 KB | Teklifler |
| `orders.json` | 3 byte | Siparişler (boş) |
| `notifications.json` | 2 KB | Bildirimler |
| `dealer-applications.json` | 2 KB | Bayi başvuruları |
| `carts.json` | 222 byte | Müşteri sepetleri |
| `audit-log.json` | 8.1 KB | Audit kayıtları |

### Prisma Schema Analizi (Kullanılmayan)

Schema kalitesi **iyi** ancak kullanılmıyor:
- ✅ 45+ model, iyi ilişkilendirme
- ✅ Uygun indeksler (`@@index`)
- ✅ Composite unique constraints
- ✅ Decimal tipi para alanları için
- ✅ Enum kullanımı tutarlı
- ✅ Soft delete alanları (status enum'ları)
- ✅ Cascade silme doğru ayarlanmış
- ⚠️ `Organization` modeli var ama multi-tenant yapı uygulanmamış
- ⚠️ Migration dosyası yok — `db push` kullanılıyor

### JSON "Veritabanı" Riskleri

1. **Atomiklik yok:** İki dosya birlikte güncellenemez (teklif + sipariş)
2. **Eşzamanlılık:** File lock yok, race condition kaçınılmaz
3. **Sorgulama:** Full scan zorunlu, indeks yok
4. **Boyut limiti:** `ai-import-jobs.json` zaten 31.8 MB — büyüdükçe bellek sorunu
5. **Yedekleme:** Dosya sistemi snapshot'ı tek yedekleme yöntemi
6. **Veri bütünlüğü:** Foreign key yok, orphan kayıt kontrolü yok

---

## J. PERFORMANS ANALİZİ

### Darboğazlar

| Sorun | Etki | Konum |
|-------|------|-------|
| 18MB JSON parse her istekte | CPU + bellek | `catalog-repository.ts:loadCatalogStore()` |
| Full array scan arama | O(n) her sorgu | `searchCatalogRecords()` |
| Senkron dosya kontrolü (`existsSync`) | I/O blokajı | 7+ repository dosyasında |
| `globals.css` 82KB tek dosya | Büyük CSS yükü | `apps/web/app/globals.css` |
| Tüm ürünler bellekte tutulma | RAM tüketimi | Her request için tüm katalog yükleniyor |

### Ölçeklenebilirlik Tahminleri

| Kullanıcı | Beklenen Davranış |
|-----------|-------------------|
| 100 | Çalışır ama JSON dosya yazmaları çakışmaya başlar |
| 1.000 | Eşzamanlı isteklerde veri kaybı yaşanır |
| 10.000 | 18MB JSON parse sunucuyu yavaşlatır, OOM riski |
| 100.000 | Sistem çalışamaz hale gelir |

### Acil Performans Önlemleri (Şimdi Gerekli)
1. PostgreSQL'e geçiş
2. Katalog verisi DB'de indeksli sorgulama
3. Meilisearch'ün etkinleştirilmesi (docker-compose'da var)
# ENTAŞBURADA - Proje Denetim Raporu (Bölüm 3/4)
## Frontend, Kod Kalitesi, Test, DevOps ve Kritik Bulgular

---

## K. FRONTEND ANALİZİ

### Sayfa Yapısı
| Sayfa | Yol | Durum |
|-------|-----|-------|
| Ana sayfa | `/` | ✅ Çalışıyor |
| Katalog | `/catalog` | ✅ Çalışıyor |
| Ürün detay | `/products/[slug]` | ✅ Çalışıyor |
| Giriş | `/login` | ✅ Çalışıyor |
| Hesap | `/account` | ✅ Çalışıyor |
| Sepet | `/cart` | ✅ Çalışıyor |
| Teklif talebi | `/quote` | ✅ Çalışıyor |
| Teklif takip | `/quote/[code]` | ✅ Çalışıyor |
| Sipariş takip | `/orders/[code]` | ✅ Çalışıyor |
| Hızlı sipariş | `/quick-order` | ✅ Çalışıyor |
| Bayi başvuru | `/dealer-application` | ✅ Çalışıyor |
| Şifre sıfırlama | `/password-reset` | ⚠️ Var ama e-posta token doğrulama yok |
| KVKK | `/kvkk` | ✅ Statik sayfa |
| Hakkımızda | `/about` | ✅ Statik sayfa |
| İletişim | `/contact` | ✅ Statik sayfa |
| Kurumsal satın alma | `/corporate-purchase` | ✅ Statik sayfa |
| Teknik dokümanlar | `/technical-documents` | ✅ Statik sayfa |
| Admin panel | `/admin/*` | ✅ Çalışıyor |

### Admin Panel Sayfaları
| Sayfa | Durum |
|-------|-------|
| Dashboard | ✅ İstatistikler, bildirimler |
| Ürün yönetimi | ✅ Listeleme, publish/unpublish |
| Teklif yönetimi | ✅ Listeleme, fiyatlandırma, siparişe dönüştürme |
| Sipariş yönetimi | ✅ Listeleme, durum güncelleme |
| Bayi başvuruları | ✅ Listeleme, onay/red |
| AI Import | ✅ PDF'den ürün çıkarma |
| XML Import | ✅ Harici XML kaynakları |
| Analitik | ✅ Müşteri davranışı, ürün ilgisi, terk edilen sepetler |
| Bildirimler | ✅ Bildirim listesi |
| Entegrasyonlar | ⚠️ Sayfa var ama boş |
| Ayarlar | ✅ Video popup, marka ayarları |

### Frontend Sorunları

**1. Bileşen Boyutları**
- `globals.css`: 81.880 byte — tek monolitik CSS dosyası, modüler değil
- `HomeHeroSlider.tsx`: 7.539 byte — kabul edilebilir
- `Header.tsx`: 4.804 byte — kabul edilebilir

**2. State Management**
- TanStack Query kullanılıyor ama sınırlı
- `quote-basket.ts` (sepete teklif ekleme) — localStorage tabanlı, hydration riski var
- Global state yönetimi yok (Context API veya Zustand kullanılmıyor)

**3. Responsive Tasarım**
- `globals.css` içinde media query'ler var ama kapsamlı test edilmemiş
- Mobil menü desteği sınırlı

**4. Erişilebilirlik**
- `aria-labelledby` ve `aria-hidden` bazı yerlerde doğru kullanılıyor (✅)
- Form label'ları eksik olabilir (incelenmesi gereken şüphe)
- Klavye navigasyonu test edilmemiş

**5. SEO**
- ✅ `robots.ts` ve `sitemap.ts` mevcut
- ✅ Metadata doğru tanımlanmış
- ✅ Semantic HTML kullanılıyor
- ⚠️ Ürün sayfalarında structured data (JSON-LD) yok

---

## L. KOD KALİTESİ VE TEKNİK BORÇ

### Kritik Teknik Borçlar

| # | Borç | Kaynak | Risk | Öncelik |
|---|------|--------|------|---------|
| 1 | JSON dosya veritabanı | Tüm repository'ler | Veri kaybı | ACİL |
| 2 | Sızan production sırları | `.env.production.local`, `.env.local` | Güvenlik ihlali | ACİL |
| 3 | Admin auth zayıflığı | `admin-auth.ts` | Yetkisiz erişim | ACİL |
| 4 | 7+ dosyada tekrar eden yardımcı fonksiyonlar | `*-repository.ts` | Bakım zorluğu | Yüksek |
| 5 | God file: `smart-import-repository.ts` (81KB) | `lib/` | Anlaşılabilirlik | Yüksek |
| 6 | God file: `catalog-ai-extractor.ts` (78KB) | `lib/` | Anlaşılabilirlik | Yüksek |
| 7 | God CSS: `globals.css` (82KB) | `app/` | Bakım zorluğu | Orta |
| 8 | Prisma schema kullanılmıyor | `packages/database` | Mimari tutarsızlık | Yüksek |
| 9 | Boş paketler (5 adet) | `packages/` | Yanıltıcı yapı | Düşük |
| 10 | `@entas/auth` izin sistemi hiç uygulanmıyor | `packages/auth` | Yetki açığı | Yüksek |

### Kullanılmayan Kodlar
- `apps/admin/` — Tamamen boş Next.js uygulaması (admin paneli `apps/web/app/admin/` içinde)
- `packages/validation/`, `packages/notifications/`, `packages/integrations/`, `packages/analytics/` — Sadece boş export
- `data/catalog-store.pre-sulama-passive.json` (14.4MB) — Eski yedek dosya

### Sabit Kodlanmış Değerler
- `commercial-repository.ts:195`: `DEFAULT_REPRESENTATIVE = "Atanmadi"` — Türkçe karakter sorunu
- `commercial-repository.ts:429`: `warehouse: "Ana Depo"` — Sabit depo adı
- `notification-repository.ts:49`: `.slice(0, 500)` — Bildirim limiti sabit kodlanmış
- `analytics-repository.ts:166`: `.slice(0, 5000)` — Event limiti sabit kodlanmış
- `catalog-repository.ts:467`: `.slice(0, 1000)` — Audit log limiti

---

## M. TEST ALTYAPISI

### Mevcut Testler
| Dosya | Tür | Durum |
|-------|-----|-------|
| `catalog-ai-extractor.test.ts` | Unit | ✅ 15KB, kapsamlı |
| `customer-pricing.test.ts` | Unit | ✅ 1.9KB |
| `password-hash.test.ts` | Unit | ✅ 1.5KB |
| `network-safety.test.ts` | Unit | ✅ 778B |
| `video-popup-policy.test.ts` | Unit | ✅ 1.4KB |
| `pdf-grid-image-regions.test.ts` | Unit | ✅ 3.4KB |
| `admin-navigation.test.ts` | Unit | ✅ 515B |
| `product-image-normalizer.test.ts` | Unit | ✅ 4.1KB |
| `packages/catalog/src/index.test.ts` | Unit | ✅ Var |
| `packages/import-engine/src/index.test.ts` | Unit | ✅ Var |
| `packages/pricing-engine/src/index.test.ts` | Unit | ✅ Var |

### Eksik Test Alanları
- ❌ Entegrasyon testleri (API route testleri)
- ❌ E2E testleri
- ❌ Repository fonksiyonları için testler (commercial, cart, dealer)
- ❌ Auth akışı testleri
- ❌ Race condition testleri
- ❌ Load/stress testleri
- ❌ Security testleri

### Test Coverage Tahmini
Kapsanan alan: ~%15 (AI import ve fiyatlandırma modülleri)
Kapsanmayan kritik alan: Auth, commercial, cart, tüm API route'lar

---

## N. DEVOPS VE DEPLOYMENT

### Mevcut Altyapı
- **Dockerfile:** ✅ Multi-stage build, production optimizasyonu
- **docker-compose.yml:** ✅ PostgreSQL, Redis, Meilisearch, MinIO tanımlı (ama uygulama bunları kullanmıyor)
- **render.yaml:** ✅ Render.com deployment yapılandırması
- **deploy.sh:** ✅ VPS'e rsync ile deployment scripti
- **docker-entrypoint.sh:** ✅ Seed data, katalog sürümü, görsel normalizasyon

### Eksiklikler

| Alan | Durum |
|------|-------|
| CI/CD pipeline | ❌ Yok |
| Staging ortamı | ❌ Yok |
| Otomatik test çalıştırma | ❌ Yok |
| Health check monitoring | ⚠️ `/api/health` var ama monitoring yok |
| Error tracking (Sentry) | ⚠️ `SENTRY_DSN` env var tanımlı ama boş |
| Analytics (PostHog) | ⚠️ `POSTHOG_KEY` env var tanımlı ama boş |
| Log aggregation | ❌ Yok (console.log/warn) |
| Backup otomasyonu | ⚠️ `deploy/backup.sh` var ama cron tanımlı değil |
| Rollback planı | ❌ Yok |
| Zero-downtime deploy | ❌ `systemctl restart` ile downtime oluşuyor |
| Secret management | ❌ Dosyada düz metin |
| Database migration | ⚠️ `db push` kullanılıyor, migration yok |

---

## O. BAĞIMLILIK ANALİZİ

### Önemli Bağımlılıklar
| Paket | Sürüm | Durum |
|-------|-------|-------|
| next | 16.2.10 | ✅ Güncel |
| react | 19.2.0 | ✅ Güncel |
| @prisma/client | 6.14.0 | ⚠️ Kurulu ama kullanılmıyor |
| @aws-sdk/client-s3 | 3.1090.0 | ⚠️ Kurulu ama MinIO kullanılmıyor |
| bullmq | 5.12.0 | ⚠️ Worker iskelet, gerçek iş yok |
| ioredis | 5.10.1 | ⚠️ Worker'da kurulu, web app'te yok |
| zod | 3.23.8 | ⚠️ import-engine'de kullanılıyor ama API route'larda yok |
| decimal.js | (peer) | ✅ Pricing engine'de doğru kullanılıyor |
| nodemailer | 9.0.3 | ✅ E-posta gönderimi çalışıyor |
| sharp | 0.34.5 | ✅ Görsel işleme çalışıyor |

### Kullanılmayan Bağımlılıklar
- `@prisma/client` + `prisma` — Kurulu ama hiçbir runtime kodu tarafından kullanılmıyor
- `@aws-sdk/client-s3` — MinIO bağlantısı için kurulu ama dosya yükleme yerel dosya sistemi kullanıyor
- `bullmq` + `ioredis` — Worker iskelet, gerçek iş yapılmıyor

---

## P. KRİTİK BULGULAR TABLOSU

| # | Bulgu | Kategori | Risk | Dosya/Modül | Etki | Çözüm | Öncelik |
|---|-------|----------|------|-------------|------|-------|---------|
| 1 | Production sırları Git'te | Güvenlik | 🔴 Kritik | `.env.production.local`, `.env.local` | API key hırsızlığı, admin erişimi | Key rotasyonu + gitignore + git geçmişi temizliği | ACİL |
| 2 | JSON dosya veritabanı | Mimari | 🔴 Kritik | Tüm `*-repository.ts` | Veri kaybı, race condition | PostgreSQL geçişi | ACİL |
| 3 | Admin auth zayıf | Güvenlik | 🔴 Kritik | `admin-auth.ts` | Yetkisiz admin erişimi | JWT/signed token, expire, RBAC | ACİL |
| 4 | IDOR — tracking code | Güvenlik | 🟠 Yüksek | `api/quotes/`, `api/orders/` | Veri sızıntısı | Auth zorunlu veya daha uzun code | Yüksek |
| 5 | CSRF koruması yok | Güvenlik | 🟠 Yüksek | Tüm POST route'lar | Cross-site işlem tetikleme | CSRF token middleware | Yüksek |
| 6 | Race condition | Veri bütünlüğü | 🟠 Yüksek | Tüm JSON yazmaları | Veri kaybı | DB geçişi veya file lock | Yüksek |
| 7 | 18MB JSON her istekte parse | Performans | 🟠 Yüksek | `catalog-repository.ts` | Yavaş yanıt, yüksek RAM | DB + indeksli sorgulama | Yüksek |
| 8 | `@entas/auth` izinleri uygulanmıyor | Yetkilendirme | 🟠 Yüksek | `packages/auth/` | Yetki kontrolü sadece UI'da | Middleware + service entegrasyonu | Yüksek |
| 9 | Rate limiting yok | Güvenlik | 🟡 Orta | Tüm API | DoS, brute-force, spam | Rate limit middleware | Orta |
| 10 | Security headers eksik | Güvenlik | 🟡 Orta | `next.config.ts` | XSS, clickjacking | Header yapılandırması | Orta |
| 11 | Floating-point para hesabı | Veri bütünlüğü | 🟡 Orta | `commercial-repository.ts` | Kuruş hataları | Decimal.js kullanımı genişletme | Orta |
| 12 | God file'lar (78-82KB) | Bakım | 🟡 Orta | `smart-import-repo`, `catalog-ai-extractor` | Anlaşılabilirlik | Modüllere bölme | Orta |
| 13 | 7+ dosyada tekrar eden kod | Bakım | 🟡 Orta | Repository'ler | DRY ihlali | Ortak modül çıkarma | Orta |
| 14 | CI/CD yok | DevOps | 🟡 Orta | — | Manuel deploy riski | GitHub Actions | Orta |
| 15 | Monitoring/alerting yok | DevOps | 🟡 Orta | — | Hata tespiti gecikir | Sentry + uptime monitor | Orta |
# ENTAŞBURADA - Proje Denetim Raporu (Bölüm 4/4)
## Önceliklendirilmiş Yol Haritası ve Sonuç

---

## Q. ÖNCELİKLENDİRİLMİŞ YOL HARİTASI

### Faz 0: ACİL GÜVENLİK (Bugün — 1-2 Gün)

Bu faz **hemen** uygulanmalıdır.

| # | İş | Detay | Süre |
|---|-----|-------|------|
| 0.1 | API key rotasyonu | OpenAI, Gemini, Resend, SMTP şifresini iptal edip yenilerini oluştur | 1 saat |
| 0.2 | Admin şifre değişikliği | `ADMIN_PASSWORD` ve `ADMIN_SESSION_SECRET` değiştir | 30 dk |
| 0.3 | `.gitignore` güncelleme | `.env*.local`, `data/`, `*.json.tmp` ekle | 15 dk |
| 0.4 | Git geçmişi temizliği | `git filter-branch` veya BFG Repo-Cleaner ile sızan sırları sil | 2 saat |
| 0.5 | Secret manager | Render.com environment variables veya 1Password/Vault | 1 saat |

---

### Faz 1: VERİTABANI GÖÇÜŞİ (1-3 Hafta)

Projenin en büyük teknik borcu. Tüm JSON dosya erişimini PostgreSQL'e taşıma.

| # | İş | Detay | Süre |
|---|-----|-------|------|
| 1.1 | Prisma migration oluştur | `db push` yerine `prisma migrate dev` akışına geç | 1 gün |
| 1.2 | Ortak DB yardımcı modül | `findWorkspaceRoot`, `readJson`, `writeJson`, `normalize`, `stripUndefined` tek bir paylaşılan modüle taşı | 1 gün |
| 1.3 | Müşteri auth geçişi | `customer-accounts.json` → `User` + `Company` tabloları | 2 gün |
| 1.4 | Teklif/sipariş geçişi | `quotes.json`, `orders.json` → `Quote`, `Order` tabloları | 3 gün |
| 1.5 | Sepet geçişi | `carts.json` → `Cart`, `CartItem` tabloları | 1 gün |
| 1.6 | Bildirim geçişi | `notifications.json` → `Notification` tablosu | 1 gün |
| 1.7 | Bayi başvuru geçişi | `dealer-applications.json` → `DealerApplication` tablosu | 1 gün |
| 1.8 | Analitik geçişi | `user-events.json` → `UserEvent` tablosu | 1 gün |
| 1.9 | Katalog store geçişi | `catalog-store.json` → `Product` tablosu + Meilisearch | 3 gün |
| 1.10 | Veri migrasyon scripti | Mevcut JSON verilerini DB'ye aktarma | 1 gün |
| 1.11 | Mevcut JSON dosyalarını yedekle ve kaldır | Eski dosyaları arşivle | 1 gün |

**Toplam tahmini süre:** 2-3 hafta (tek geliştirici)

---

### Faz 2: KALİTE VE GÜVENLİK İYİLEŞTİRMELERİ (2-4 Hafta)

| # | İş | Detay | Süre |
|---|-----|-------|------|
| 2.1 | Admin auth güçlendirme | JWT veya signed session, expire, logout, timing-safe | 2 gün |
| 2.2 | RBAC uygulama | `@entas/auth` paketindeki `can()` fonksiyonunu API route'lara entegre et | 2 gün |
| 2.3 | CSRF koruması | Next.js middleware ile CSRF token kontrolü | 1 gün |
| 2.4 | Rate limiting | API route'lara IP bazlı rate limiter ekle | 1 gün |
| 2.5 | Security headers | `next.config.ts`'ye CSP, HSTS, X-Frame-Options ekle | 0.5 gün |
| 2.6 | Request validation | API route'lara Zod schema validation ekle | 3 gün |
| 2.7 | IDOR düzeltme | Tracking code'ları güçlendir veya auth zorunlu kıl | 1 gün |
| 2.8 | God file refactoring | `smart-import-repository.ts` ve `catalog-ai-extractor.ts`'yi modüllere böl | 3 gün |
| 2.9 | CSS modüler yapı | `globals.css`'yi bileşen bazlı CSS modules'a dönüştür | 3 gün |
| 2.10 | Entegrasyon testleri | API route'lar için test yazımı | 3 gün |
| 2.11 | E2E test altyapısı | Playwright kurulumu ve temel akış testleri | 2 gün |
| 2.12 | Decimal.js genişletme | Repository katmanında para hesaplamalarını Decimal.js'e geçir | 1 gün |

---

### Faz 3: BÜYÜME ALTYAPISI (1-2 Ay)

| # | İş | Detay | Süre |
|---|-----|-------|------|
| 3.1 | CI/CD pipeline | GitHub Actions: lint, test, build, deploy | 2 gün |
| 3.2 | Staging ortamı | Render.com veya Docker Compose ile staging | 1 gün |
| 3.3 | Error tracking | Sentry entegrasyonu | 1 gün |
| 3.4 | Monitoring | Uptime monitoring, health check alerting | 1 gün |
| 3.5 | Meilisearch etkinleştirme | Ürün araması için full-text search | 2 gün |
| 3.6 | Redis/BullMQ etkinleştirme | E-posta, bildirim, import işleri için queue | 3 gün |
| 3.7 | MinIO/S3 etkinleştirme | Ürün görselleri için object storage | 2 gün |
| 3.8 | Multi-admin desteği | Birden fazla admin kullanıcı, rol bazlı erişim | 3 gün |
| 3.9 | Ödeme sistemi | Stripe/iyzico entegrasyonu | 5 gün |
| 3.10 | Fatura sistemi | E-fatura/e-arşiv fatura entegrasyonu | 5 gün |
| 3.11 | API dokümantasyonu | OpenAPI/Swagger tanımları | 2 gün |
| 3.12 | Performans optimizasyonu | DB query optimization, caching, CDN | 3 gün |
| 3.13 | Backup otomasyonu | PostgreSQL pg_dump cron + offsite backup | 1 gün |
| 3.14 | Log aggregation | Structured logging + merkezi log toplama | 2 gün |

---

## R. SONUÇ VE DEĞERLENDİRME

### Projenin Güçlü Yönleri
1. **İş modeli doğru kurgulanmış** — B2B bayi fiyatlandırma, teklif/sipariş akışı, dealer onay süreci mantıklı
2. **Monorepo yapısı temiz** — Paketler doğru ayrılmış, Turborepo ile build yapısı iyi
3. **Fiyatlandırma motoru profesyonel** — `@entas/pricing-engine` Decimal.js ile hassas hesaplama, audit trail, çoklu kural desteği
4. **AI import yeteneği gelişmiş** — PDF'den ürün çıkarma, XML import, çoklu kaynak desteği
5. **Atomik dosya yazımı** — `rename()` ile atomik yazma (yarım dosya okuması engelleniyor)
6. **TypeScript tutarlılığı** — Strict mode, tip tanımları kapsamlı
7. **Prisma schema kalitesi** — Kullanılmıyor olsa da tasarımı profesyonel

### Projenin Zayıf Yönleri (Özet)
1. **Veritabanı yok** — En büyük teknik borç
2. **Güvenlik sızıntıları** — Git'te açık sırlar
3. **Admin auth zayıf** — Tek kullanıcı, süresiz session
4. **Ölçeklenemez** — JSON dosya sistemi
5. **Test coverage düşük** — ~%15
6. **Monitoring yok** — Hata tespiti imkansız
7. **CI/CD yok** — Manuel deployment

### Genel Değerlendirme

ENTAŞBURADA, **iyi düşünülmüş bir iş modeli üzerine inşa edilmiş, fonksiyonel bir MVP**'dir. Ancak mimari kararlar (JSON dosya sistemi) ve güvenlik eksiklikleri nedeniyle **production kullanıma hazır değildir**.

Projenin en büyük paradoksu: **Prisma schema profesyonelce tasarlanmış (45+ model, enum'lar, indeksler)** ama uygulama bu schema'yı hiç kullanmıyor. Bu, projenin "doğru mimariyi biliyor ama henüz uygulamamış" olduğunu gösterir.

**Faz 0 (güvenlik) bugün, Faz 1 (DB göçüşü) bu hafta başlamalıdır.** Faz 1 tamamlandığında proje, güvenli ve ölçeklenebilir bir yapıya kavuşacak ve gerçek production trafiğine hazır olacaktır.

---

> **Bu rapor 4 bölümden oluşmaktadır:**
> - Bölüm 1: Yönetici Özeti, Proje Envanteri, Mimari Analiz
> - Bölüm 2: Backend, Güvenlik, Kimlik Doğrulama, Veritabanı Analizi
> - Bölüm 3: Frontend, Kod Kalitesi, Test, DevOps, Kritik Bulgular
> - Bölüm 4: Yol Haritası ve Sonuç (bu bölüm)
