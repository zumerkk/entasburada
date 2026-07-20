# ENTAŞBURADA Proje Denetimi ve Teknik Analiz Raporu

Tarih: 2026-07-19

## A. Yönetici Özeti

Entaşburada projesi, Next.js, Turborepo, TypeScript ve Prisma gibi modern ve güçlü teknolojiler kullanılarak tasarlanmış bir B2B e-ticaret ve teklif platformudur. Projenin genel mimarisi, yapay zekâ destekli katalog okuma, gelişmiş fiyatlandırma motoru ve modüler paket yapısı (packages/*) açısından oldukça başarılı tasarlanmıştır.

Ancak proje **şu anki hâliyle canlı ortama (production) çıkmaya kesinlikle hazır değildir.** Sistemdeki en büyük sorun; son derece detaylı ve doğru tasarlanmış bir PostgreSQL veritabanı şeması (Prisma) bulunmasına rağmen, **ana web uygulamasının ve admin panelinin bu veritabanını kullanmamasıdır.** Müşteri kayıtları, teklifler, siparişler ve katalog verileri tamamen sunucudaki yerel JSON dosyalarında (`data/*.json`) tutulmaktadır. 

Bu yapı:
1. Müşteri şifrelerinin şifrelenmeden (plain text) dosyalarda saklanmasına neden olarak devasa bir güvenlik açığı yaratmaktadır.
2. Birden fazla kullanıcı aynı anda sipariş verdiğinde verilerin birbirini ezmesine (race condition) sebep olur.
3. Vercel gibi sunucusuz (serverless) ortamlarda barındırıldığında, JSON dosyalarına ve `public/uploads` klasörüne yapılan kayıtların silinmesi (veri kaybı) riski yaratır.

Bunun yanı sıra admin panelindeki kritik menüler (Teklifler, Siparişler) API ve Component eksikliği nedeniyle çalışmamaktadır. Projenin acilen "dosya tabanlı" çalışan bu "Mock/MVP" yapısından, "veritabanı tabanlı" kalıcı yapıya taşınması gerekmektedir.

---

## B. Proje Puan Kartı

| Alan | Puan | Gerekçe |
| :--- | :---: | :--- |
| **Mimari** | 50/100 | Monorepo ve domain bazlı paket yapısı mükemmel, ancak veritabanı yerine JSON dosyalarına yazan mock altyapısı bu puanı düşürüyor. |
| **Backend** | 30/100 | Sipariş ve teklif admin API'leri eksik. Veriler text tabanlı JSON dosyalarında mutasyona uğruyor. |
| **Frontend** | 60/100 | Modern React 19 ve Next.js 16 stack'i kullanılmış. Ancak Admin dashboard'da hash (#) routing hataları var. |
| **Veritabanı** | 80/100 | Tasarlanan Prisma şeması son derece kaliteli ve kapsamlı. (Ancak henüz uygulama tarafından kullanılmıyor, potansiyel puan 80) |
| **Güvenlik** | 20/100 | Şifrelerin JSON dosyasında plain-text saklanması, admin şifresinin hardcoded (.env) olması. |
| **Performans** | 40/100 | Tüm veriyi JSON dosyasından parse etmek kullanıcı sayısı artınca belleği tıkayacaktır. |
| **Ölçeklenebilirlik** | 10/100 | Yerel dosya sistemine yazan bir uygulama yatayda ölçeklenemez (Horizontal scaling imkansız). |
| **Kod Kalitesi** | 70/100 | TypeScript tipleri, fonksiyonel programlama prensipleri ve klasör yapısı gayet iyi. |
| **Test Altyapısı** | 60/100 | Vitest ile yazılmış temel birim testleri var ancak E2E ve DB testleri eksik. |
| **DevOps** | 30/100 | Docker-compose bulunuyor ancak CI/CD ve Serverless deployment için cloud storage (R2/S3) altyapısı kurulmamış. |
| **Kullanıcı Deneyimi**| 60/100 | Public katalog ve filtreleme fena değil fakat admin paneli kırık linklerle dolu. |
| **Dokümantasyon** | 70/100 | Proje içinde audit, live-readiness ve mimari notları oldukça iyi belgelenmiş. |
| **Bakım Kolaylığı** | 50/100 | Modüler yapı bakımı kolaylaştırıyor fakat teknik borç (JSON'dan DB'ye geçiş) büyük bir engel. |
| **Production Hazırlığı**| 10/100 | Veri kaybı riski nedeniyle şu an canlıya alınamaz. |

---

## C. Sistem ve Mimari Haritası

**1. Katmanlar ve Paketler (Turborepo Workspace):**
- **Apps:**
  - `apps/web`: Next.js tabanlı ana uygulama (Hem public e-ticaret yüzü hem de Admin arayüzü `/admin` burada).
  - `apps/admin`: Ayrı oluşturulmuş ancak atıl kalmış, boş bir Next.js uygulaması.
  - `apps/worker`: BullMQ ve Redis kullanan asenkron görev işleyicisi (Background jobs).
- **Packages:**
  - `@entas/database`: Prisma şeması ve veritabanı istemcisi. (Kusursuz tasarlanmış ama UI'a bağlanmamış)
  - `@entas/auth`: Rol tabanlı yetki sınırlarını çizen paket.
  - `@entas/catalog`, `@entas/pricing-engine`, `@entas/import-engine`, `@entas/ui`: Domain logic paketleri.

**2. Veri Akışı ve Darboğaz (Mevcut Durum):**
Kullanıcı işlemi → Frontend (apps/web) → Server Action / API → `lib/commercial-repository.ts` → **Node.js FileSystem (data/orders.json)**.
Gerçek veritabanı (Prisma) bu akışta tamamen by-pass edilmiştir.

---

## D. Modül Bazlı Analiz

### 1. Kimlik Doğrulama (Auth Modülü)
- **Durum:** `lib/customer-auth.ts` ve `lib/admin-auth.ts` üzerinden yürütülüyor.
- **Eksikler:** Müşteri verileri `data/customer-accounts.json` dosyasında tutuluyor. Yeni eklenen şifreler "Argon/Scrypt" ile hashlense de eski şifreler düz metin durabiliyor. Admin girişi sadece .env dosyasındaki tek bir `ADMIN_PASSWORD` ile yapılıyor. Veritabanındaki çok detaylı "Rol ve İzin Matrisi" tamamen işlevsiz durumda.

### 2. Ticari Modül (Sipariş ve Teklifler)
- **Durum:** `lib/commercial-repository.ts` dosyası üzerinden yürütülüyor.
- **Eksikler:** Veriler `data/quotes.json` ve `data/orders.json` dosyalarına yazılıyor. İşlemler sırasında concurrency kilitleri zayıf. "Atomik" yazma işlemi için tmp dosyasına yazıp isim değiştirme (rename) yapılsa da yoğun trafikte veri kaybı kesindir.

### 3. Katalog ve İçe Aktarma (Import Modülü)
- **Durum:** `data/catalog-store.json` kullanılarak oldukça hızlı bir bellek içi (in-memory) katalog sunuluyor.
- **Güçlü Yönler:** AI destekli PDF veri çıkarımı, esnek XML parse yeteneği mükemmel tasarlanmış.
- **Zayıf Yönler:** Kategori ağacı hard-coded string'lere bağlı. Gerçek kategorizasyon eşleşmediği için anasayfadaki hızlı katalog linkleri boş ürün döndürüyor.

### 4. Admin Paneli
- **Durum:** Kısmen çalışıyor, kısmen kırık.
- **Eksikler:** `/admin#quotes` ve `/admin#orders` linkleri client-side router veya ilgili component olmadığı için doğrudan ana dashboard'u açıyor. Bu sayfaların arkasındaki API endpointleri (`/api/admin/quotes` vb.) hiç yazılmamış.

---

## E. Kritik Bulgular Tablosu

| No | Bulgu | Kategori | Risk | Etkilenen Alan | Dosya/Modül | Etki | Çözüm | Öncelik |
|:---|:---|:---|:---|:---|:---|:---|:---|:---|
| 1 | **Dosya Tabanlı Veri Depolama (Veri Kaybı)** | Mimari | Kritik | Tüm Sistem | `apps/web/lib/*-repository.ts` | Sunucu yeniden başladığında, dağıtıldığında veya aynı anda 2 işlem geldiğinde veri ezilir/kaybolur. | Mevcut Prisma şemasına (database) acil geçiş yapılmalıdır. | Kritik (P0) |
| 2 | **Düz Metin (Plain Text) Şifreler** | Güvenlik | Kritik | Auth | `data/customer-accounts.json` | Veri sızıntısında tüm kullanıcıların şifreleri açığa çıkar. | Tüm şifrelerin hashlenmesi ve DB'ye taşınması. | Kritik (P0) |
| 3 | **Bozuk Admin Paneli ve Eksik API'ler** | Frontend/Backend | Yüksek | Admin Dashboard | `apps/web/app/admin/page.tsx` | Yöneticiler teklif ve siparişleri panel üzerinden yönetemez. | Eksik admin endpointleri yazılmalı, URL hash routing yerine normal sub-path routing yapılmalı. | Yüksek (P1) |
| 4 | **Sunucusuz (Serverless) Medya Yüklemeleri** | DevOps | Yüksek | Dosya Yönetimi | `public/uploads` | Vercel gibi ortamlarda yüklenen resimler/pdf'ler ilk deploy'da silinir. | Yüklemeler Cloudflare R2 veya AWS S3'e yönlendirilmelidir. | Yüksek (P1) |
| 5 | **Hardcoded Admin Kimliği** | Güvenlik | Orta | Admin Auth | `apps/web/lib/admin-auth.ts` | Çoklu yönetici ataması, yetkilendirme ve denetim izi (audit log) yapılamaz. | Prisma şemasındaki `Role`, `User` tablosuna geçilmesi. | Orta (P2) |

---

## F. Hata ve Risk Senaryoları

> [!WARNING]
> İleride karşılaşılabilecek gerçekçi senaryolar aşağıda listelenmiştir:

**Senaryo 1: Eş Zamanlı Kullanıcı İşlemleri (Race Condition)**
- **Tetikleyici:** İki bayi aynı saniye içinde sepete ürün ekler veya sipariş oluşturur.
- **Sistem Davranışı:** `commercial-repository.ts` dosyası JSON'u okur, bellekte günceller ve dosyaya geri yazar. Eş zamanlı işlemde ikinci işlem, birinci işlemin verisini ezer.
- **Sonuç:** Sipariş kaybolur veya sepetler karışır.
- **Çözüm:** PostgreSQL / Prisma transaction yapısına geçiş.

**Senaryo 2: Vercel / Cloud Deployment Veri Uçması**
- **Tetikleyici:** Projeye ufak bir kod güncellemesi yapılıp CI/CD ile sunucuya deploy edilir.
- **Sistem Davranışı:** Serverless yapıda yerel disk (ephemeral) sıfırlanır. Tüm `data/*.json` ve `public/uploads` dosyaları projenin ilk haline döner.
- **Sonuç:** Canlı ortamdaki tüm siparişler, yeni müşteriler ve yüklenen ürün resimleri tamamen silinir.
- **Çözüm:** Veritabanı ve S3 (Object Storage) entegrasyonu zorunludur.

**Senaryo 3: Müşteri Sayısı Artışında OOM (Out of Memory)**
- **Tetikleyici:** Müşteri ve sipariş sayısı 10.000'i geçtiğinde.
- **Sistem Davranışı:** Sistem bir sipariş listesini çekerken tüm 10.000 satırlık JSON dosyasını `JSON.parse` ile belleğe alır, filtreler ve sayfalama (pagination) yapar.
- **Sonuç:** Node.js bellek sınırını aşar ve API çöker.

---

## G. Eksik Özellikler

**Zorunlu Eksikler (Canlıya Çıkmadan Önce P0):**
- PostgreSQL veritabanı entegrasyonunun web tarafına bağlanması.
- Sipariş ve Teklifler için Admin panel API'lerinin yazılması ve UI'ın düzeltilmesi.
- Dosya yüklemelerinin Cloudflare R2'ye geçirilmesi.
- E-posta tetiklemelerinin (Gerçek SMTP/Resend ile) aktifleştirilmesi.

**Büyüme Aşamasında Gerekli (P2):**
- Muhasebe / ERP (Logo, Mikro vb.) adaptörü.
- Meilisearch / Elasticsearch tabanlı toleranslı hızlı arama motoru.
- Sipariş bazlı online ödeme (Sanal POS) altyapısı.

---

## H. Teknik Borç Listesi

1. **`import-commercial-json-to-prisma.ts` Scriptinin Uygulanması:** Veriler geçici json'larda birikmiş, veritabanına taşınması ve uygulamanın DB'den okunacak şekilde (ORM) refactor edilmesi. (Risk: Çok Yüksek)
2. **Kategori Mimarisi:** Kategori adlarının hardcoded stringlerden çıkarılıp Prisma `Category` modeli ile dinamik ilişkilendirilmesi.
3. **Admin Routing Refactor:** Hash (`#quotes`) ile UI değiştirmeye çalışmak React/Next.js best practice'lerine aykırıdır, dinamik rotalara (`/admin/quotes`) geçilmelidir.
4. **Kullanılmayan `apps/admin` Klasörü:** Monorepo içindeki gereksiz karışıklığı önlemek için projeden silinmeli veya admin ayrılacaksa tam ayrılmalıdır.

---

## I. Güvenlik Raporu

> [!CAUTION]
> Güvenlik açısından en büyük risk verilerin ve şifrelerin JSON içinde şifrelenmeden tutulma ihtimalidir. `customer-auth.ts` içinde geçici `upgradeLegacyPassword` metodu var fakat veritabanı zorunluluğu yoktur.

- **Broken Access Control:** Admin API endpointleri eksik, ancak yarın eklendiğinde `isAdminAuthenticated` cookie tabanlı basit token kontrolü yerine gerçek JWT/Session kurgusu yapılmalı.
- **Rate Limit Eksikliği:** Giriş denemeleri (login) için hiçbir koruma yok, brute-force ile bayi şifreleri kolayca kırılabilir.
- **Secret Leakage:** `.env` tarafında hardcoded şifre yaklaşımı production için devasa bir risktir.

---

## J. Veritabanı Raporu

Projenin en başarılı noktası `@entas/database/prisma/schema.prisma` dosyasıdır.
- **Güçlü Yönleri:** Normalizasyon çok başarılı, İlişkiler (Foreign keys, Cascadeler), Enum yapıları (Durumlar), Şirket Rolleri ve Fiyat Kuralları (PriceRule) harika modellenmiş.
- **Zayıf Yönleri:** Kesinlikle hiçbir zayıf yönü yok **HARIÇ:** Bu şema sadece duruyor, kod tarafından CRUD işlemleri için kullanılmıyor. Tamamen pasif bir dekor durumunda.

---

## K. Test Planı

- **Data Migration Test:** Mevcut JSON datasının PostgreSQL'e kayıpsız aktarılması test edilmeli.
- **Concurrency Test (Load Test):** Aynı anda 50 sipariş talebi oluşturularak veritabanı kilitlenme (lock/deadlock) yönetimi test edilmeli.
- **E2E Test:** Bir bayinin login olması -> sepet oluşturması -> teklif istemesi -> adminin teklifi fiyatlandırması -> bayinin onaylaması süreci Cypress / Playwright ile test edilmeli.

---

## L. İyileştirme Yol Haritası

### Aşama 0: Acil Güvenlik ve Veri Kaybı Önlemleri (Canlıya Çıkış Blokeri)
- **Yapılacak İş:** Projedeki JSON Repository pattern'lerinin (`catalog-repository`, `commercial-repository`, `customer-auth`) Prisma ORM'e bağlanacak şekilde yeniden yazılması.
- **Neden Gerekli:** Sunucu kapandığında/deploy edildiğinde veri uçmaması için.

### Aşama 1: Stabilizasyon ve Admin Düzeltmeleri
- **Yapılacak İş:** Kırık olan `/admin#quotes` router yapısının düzeltilip `/api/admin/quotes` endpointlerinin geliştirilmesi. Statik kategorilerin dinamik veritabanı kategorilerine eşlenmesi.
- **Neden Gerekli:** Yöneticinin sistemi yönetebilmesi için.

### Aşama 2: Medya ve Altyapı
- **Yapılacak İş:** Ürün görselleri ve pdf'lerin Cloudflare R2'ye yüklenmesini sağlayan servis entegrasyonu. Background job'ların BullMQ + Redis ile gerçek cron'lara bağlanması.

---

## Sonuç: Kritik Soruların Cevapları

**1. Proje şu an production ortamına çıkmaya hazır mı?**
**Kesinlikle Hayır.** 

**2. Hazır değilse önündeki en kritik engeller nelerdir?**
Veritabanı yerine yerel dosya sistemi (JSON) kullanılması. Sunucusuz (Vercel) ortamlarda bu veriler her deploy'da silinir.

**3. Veri kaybına neden olabilecek noktalar var mı?**
Evet. JSON üzerine asenkron yazma (file I/O) işlemleri hem concurrency sorunları hem de sunucu kapanmalarında %100 veri kaybı yaratır. Local uploads `public/uploads` yine uçucu bir yapıdadır.

**4. Yetkisiz veri erişimine neden olabilecek noktalar var mı?**
Evet. Eski JSON dosyalarında şifreler açık (plain text) bulunabilir. Admin authentication sadece ENV bazlı tekil bir parolaya dayalı.

**5. Sistemin en kırılgan üç bölümü hangisidir?**
- JSON Data Store
- Admin Dashboard Router yapısı
- Sabit disk tabanlı dosya yükleme (Upload) sistemi

**6. Sistemin en iyi tasarlanmış üç bölümü hangisidir?**
- Prisma Veritabanı Şeması
- Turborepo Monorepo / Package Mimarisi
- Katalog Import ve AI Fiyatlama Motoru (Pdf/Xml parserlar)

**7. En acil düzeltilmesi gereken on problem nedir?**
1. Commercial-repo'nun Prisma'ya geçirilmesi
2. Customer-auth'un Prisma'ya geçirilmesi
3. Catalog-repo'nun Prisma'ya geçirilmesi
4. Admin Sipariş ve Teklif API'lerinin yazılması
5. Admin UI Hash router hatasının giderilmesi
6. Cloudflare R2 / S3 Entegrasyonu (Uploads)
7. Kategori eşleme hatası nedeniyle boş çıkan kategoriler
8. Şifrelerin zorunlu Hash'e geçirilmesi
9. Redis/BullMQ worker'ın aktif hale getirilmesi
10. SMTP e-posta entegrasyonunun tamamlanması

**8. Yeni özellik geliştirmeye başlamadan önce hangi işler tamamlanmalıdır?**
PostgreSQL DB bağlantıları ve repository pattern refactor işlemi.

**9. Kullanıcı sayısı on kat arttığında ilk neresi sorun çıkarır?**
`JSON.parse(await readFile(...))` yapan tüm API katmanları RAM'i (Memory) anında doldurup sunucuyu kilitleyecektir (OOM).

**10. Proje tek geliştiriciye veya belirli kişilere aşırı bağımlı mı?**
Evet, proje mimarisi çok katmanlı ve "over-engineered" parçalar barındırıyor. Sistemdeki dosya bağımlılıkları ve bypass edilmiş veritabanı kurgusunu ancak projeyi yazan kişi (veya sistemi uçtan uca analiz edebilen uzmanlar) anlayabilir.

**11. Mevcut veritabanı büyümeye uygun mu?**
Prisma şeması mükemmel ötesi bir B2B e-ticaret yapısına sahip. **Ancak kullanılmıyor.** Kullanılmaya başlandığında rahatlıkla 10+ yıl ölçeklenebilir.

**12. Yetki sistemi yeterli mi?**
Şemada (Role, Permission matrisi) yeterli ancak koda/API'ye uygulanmamış (sadece .env dosyasındaki ADMIN_PASSWORD var).

**13. Test altyapısı kritik hataları yakalayabilir mi?**
Vitest var ancak unit test seviyesinde. Mimari bir kusur olan JSON yazma problemini veya E2E admin router kırıklığını yakalayacak bir Cypress testi yok.

**14. Deployment sırasında geri dönüş planı var mı?**
Monorepo/Vercel standartlarında build alınabilir ama veritabanı kullanılmadığı için JSON state geriye dönüldüğünde tüm sipariş verileri yok olacaktır.

**15. Sistem izlenebilir ve hata ayıklanabilir durumda mı?**
Hayır. Sentry gibi bir APM entegrasyonu yok.

**16. Teknik borç seviyesi nedir?**
Çok yüksek. Sistemin kalbi sayılacak veritabanı katmanı "geçici mock çözüm" olarak dosya sisteminde bırakılmış. En az 2-3 haftalık hardcore refactor gerekiyor.

**17. Projede gereksiz karmaşıklık var mı?**
`apps/admin` gibi atıl duran Next.js projeleri monorepo içinde kafa karışıklığı yaratıyor. 

**18. Projede aşırı basitleştirilmiş ve riskli alanlar var mı?**
Veritabanı yerine JSON okuma/yazma, admin girişi için hardcoded password.

**19. Hangi özellikler varmış gibi görünüyor ancak gerçekte tamamlanmamış?**
Admin Panelindeki Siparişler ve Teklifler sayfaları (menü var, UI yok, API yok). Hızlı katalog kategorileri (menü var, filtre bozuk ürün yok).

**20. Projenin profesyonel, güvenli ve ölçeklenebilir hâle gelmesi için izlenmesi gereken en doğru sıra nedir?**
1. Prisma Migration (JSON'dan DB'ye geçiş) 
2. R2/S3 Entegrasyonu (Uçucu diskten Cloud Storage'a geçiş) 
3. Admin API'lerinin ve Yönlendirmelerinin Tamamlanması 
4. Gerçek Auth sisteminin kodlanması
5. Cloud (Vercel/Supabase vb.) deployment.
