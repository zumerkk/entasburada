# ENTAŞBURADA Katalog ve Admin Audit

Tarih: 2026-07-07

## 1. `/admin#quotes` Neden Boş veya Açılmıyor?

`/admin#quotes` gerçek bir Next.js route veya admin panel component'i değil. Mevcut `AdminFrame` içinde “Teklifler” menüsü `href="/admin#quotes"` olarak tanımlı, fakat `/admin` sayfasında `id="quotes"` olan bir panel veya hash değişimini okuyup ilgili component'i mount eden client-side router yok.

Hash fragment sunucuya gönderilmediği için Next.js `/admin#quotes` isteğini normal `/admin` olarak render eder. Sonuçta kullanıcı dashboard'a düşer; teklif ekranı hiç mount edilmez.

## 2. `/admin#orders` Neden Boş veya Açılmıyor?

`/admin#orders` için de aynı sorun geçerli. Menü linki var ama gerçek `/admin/orders` route'u, hash parser, orders component'i veya backend endpoint'i yok. Dashboard içinde `id="orders"` alanı da olmadığı için anchor hedefi de bulunmuyor.

## 3. Hash Route, Router, Component Mount, API, Authorization ve Veri Hataları

- Hash route parser yok.
- Hash değişimini dinleyen client component yok.
- Quotes ve Orders component'leri yok.
- Quotes ve Orders API endpointleri yok.
- Admin authorization yalnızca mevcut `/admin`, `/admin/products`, `/admin/import` rotalarında uygulanıyor.
- Veri sorgusu yok; Prisma şemasında `QuoteRequest` ve `Order` modelleri var ama web uygulamasına bağlı repository/API katmanı bulunmuyor.

## 4. Admin Modüllerinin Backend Endpointleri Çalışıyor Mu?

Mevcut çalışan admin endpoint:

- `/api/admin/products`

Eksik endpointler:

- `/api/admin/quotes`
- `/api/admin/orders`

Bu eksiklikler nedeniyle teklif ve sipariş ekranları API üzerinden veri çekemiyor.

## 5. Sipariş ve Teklif Tabloları Gerçek Veritabanından Mı Çekiliyor?

Hayır. Prisma şemasında `QuoteRequest`, `QuoteItem`, `Order`, `OrderItem`, `Shipment`, `Payment` ve ilişkili modeller mevcut; ancak `apps/web` içinde bu modellere bağlı çalışan bir repository veya Prisma client kullanımı yok. Bu nedenle admin sipariş/teklif tabloları fiilen hiçbir kaynağa bağlı değil.

## 6. API Hata Veriyor Mu?

İlgili endpointler olmadığı için hata “API runtime hatası” değil, “route yokluğu” seviyesinde. Ek olarak dashboard hash linkleri endpoint çağrısı da yapmadığından hata sessiz kalıyor.

## 7. Yetki Kontrolü Yanlışlıkla Gizliyor Mu?

Hayır. Sorun yetki kontrolünden önce başlıyor: ilgili ekranlar ve endpointler yok. Mevcut admin cookie kontrolü ürün API tarafında doğru şekilde 401 döndürüyor.

## 8. Frontend State veya Query Parametresi Hatası Var Mı?

Evet. Hash değerini state'e çeviren bir yapı yok. `#quotes` ve `#orders` hashleri UI state üretmiyor.

## 9. Ana Sayfadaki Hızlı Katalog Neden 0 Ürün Gösteriyor?

İlk hızlı katalog önce veri tabanlı en çok kullanılan tedarikçi kategorilerini gösteriyordu; ancak header mega menü ve statik kategori listeleri hâlâ `apps/web/data/catalog.ts` içindeki domain/pazarlama kategori adlarından besleniyordu. Import edilen ürün kategorileri ise tedarikçi kategori adlarıdır.

Örnek mevcut import kategorileri:

- `SARI FİTTİNGSLER`
- `PPRC FİTTİNGSLER`
- `TAHRAT MUSLUKLARI`
- `Dalgıç Pompalar`
- `BATARYALAR`
- `DUŞ TAKIMLARI`

0 ürün üreten statik kategori örnekleri:

- `Elektrikli El Aletleri`
- `El Aletleri`
- `Oto Servis Ekipmanları`
- `İş Güvenliği`
- `Boya ve Kimyasallar`
- `Elektrik Malzemeleri`
- `Bahçe ve Tarım`

Bu adlar import verisindeki kategori/path alanlarıyla birebir eşleşmediği için kategori filtresi ürünleri dışarıda bırakıyor.

## 10. Kategori Slug'ları ile Veri İlişkileri Uyuşuyor Mu?

Kısmen. Tedarikçi kategori adıyla gelen linkler çalışıyor; hardcoded ENTAS kategori adları çalışmıyor. Türkçe slug normalize fonksiyonu mevcut, fakat kategori sözlüğü/import kategori eşlemesi eksik.

## 11. Ürünler Root/Child/Brand İlişkisi Nedeniyle Filtre Dışı Kalıyor Mu?

Evet. Ürünlerde gerçek `categoryId` hiyerarşisi yok; dosya tabanlı katalogda `category` ve `categoryPath` alanları var. Ana kategori seçimi alt kategori/ancestor mantığına çevrilmediği için üst kategori linkleri ürünleri bulamıyor.

## 12. Public Katalog Sorgusu Yanlış Status Koşulu ile Ürün Gizliyor Mu?

Hayır. `data/catalog-store.json` içinde 2.960 ürün `ACTIVE` ve `isVisible=true`. Ana `/catalog` bu ürünleri gösteriyor. Sorun visibility değil, kategori filtresi/eşleme katmanı.

## 13. Import Edilen Ürünlerin `categoryId` Alanları Doğru Mu?

Dosya tabanlı katalogda `categoryId` yok. Import verisi `categoryName` ve `categoryPath` taşıyor. Prisma `Category` modeli var fakat import sonuçları henüz gerçek categoryId ilişkilerine migrate edilmedi.

## 14. Kategori Sayfalarında Hardcoded Slug, Eski ID veya Yanlış Query Var Mı?

Evet. Header mega menü `apps/web/data/catalog.ts` statik kategorilerinden URL üretiyor. Bu URL'ler gerçek ithal kategori sözlüğünü kullanmıyor.

## 15. Ana Katalog URL'si ile Hızlı Katalog URL'si Arasında Veri Kaynağı Farkı Var Mı?

Ana katalog `/catalog` aynı gerçek katalog deposunu kullanıyor ve 2.960 aktif ürün gösteriyor. Fark, bazı yönlendirmelerin aynı veri kaynağına gitmesine rağmen yanlış `category` filtresi taşıması.

## 16. Search Index, Cache veya ISR Eski Veri Döndürüyor Mu?

Mevcut uygulamada ayrı search index, Redis veya ISR cache kullanılmıyor. Sayfalar `dynamic = "force-dynamic"` ve `catalog-store.json` dosyasından okunuyor. Sorun cache değil, kategori bilgi mimarisi ve hash route eksikliği.

## 17. Çalışan 2.960 Ürünlük Katalog Hangi Route/API Üzerinden Veri Çekiyor?

Çalışan ana katalog:

- Route: `/catalog`
- Repository: `apps/web/lib/catalog-repository.ts`
- Veri kaynağı: `data/catalog-store.json`
- API karşılığı: `/api/products`

Health doğrulaması:

- `/api/health` -> `active: 2960`, `importedRows: 2960`

## Root Cause Özeti

1. Admin teklif/sipariş ekranları gerçek route/component/API olmadığı için çalışmıyor.
2. `/admin#quotes` ve `/admin#orders` hashleri sunucu tarafında okunamaz; client redirect/router yok.
3. Public katalog 2.960 ürünü gösteriyor, fakat header/home kategori linkleri import kategori sözlüğüne bağlı değil.
4. Kategori filtreleri parent/child/alias/fallback mantığı taşımıyor.
5. Prisma modelleri var ama quotes/orders için web repository ve endpoint katmanı yok.
