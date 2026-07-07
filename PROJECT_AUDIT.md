# ENTAŞBURADA Proje Denetimi

Tarih: 2026-07-07

## Genel Durum

ENTASBURADA monoreposu Next.js 16, React 19, pnpm workspace, TypeScript, Prisma şema paketi, XML import motoru, fiyat motoru ve paylaşılan UI paketlerinden oluşuyor. Public web uygulaması `apps/web`, eski ayrı admin uygulaması `apps/admin`, domain paketleri ise `packages/*` altında.

Mevcut import komutu iki tedarikçi kaynağını okuyabiliyor:

- `data/import-sources/EFIYATkopyasi.xml`
- `data/import-sources/EuromixStoklar.xml`

Son başarılı import raporu:

- Toplam ürün: 2.960
- Mirsan EFIYAT XML: 343 kabul edilen satır
- EuroMix Stok XML: 2.617 kabul edilen satır
- Stokta: 1.218
- Az stok: 177
- Stok yok: 1.565
- Fiyatlı satır: 2.372
- Sıfır fiyatlı satır: 588
- Kritik parse hatası: 0

## Çalışan Parçalar

- XML parser UTF-8 ve UTF-16LE kaynakları okuyabiliyor.
- EuroMix `<Stok>` alanları ve Mirsan `<urun>` alanları normalize ediliyor.
- Fiyat motoru onaysız kullanıcıda fiyatı gizleyen domain testine sahip.
- Public UI üzerinde fiyat kartı `PriceGate` ile gizleniyor.
- Prisma şeması ve domain paketlerinin temel build/typecheck akışı mevcut.
- Ayrı `apps/admin` uygulaması import raporunu gösterebiliyor.

## Kritik Açıklar

- Public katalog hâlâ `apps/web/data/catalog.ts` içindeki 4 adet demo ürünle çalışıyordu.
- Import edilen 2.960 ürün public siteye bağlanmamıştı.
- Ürün yayın yaşam döngüsü yoktu: import sonrası taslak, admin onayı, yayın ve audit ayrımı bulunmuyordu.
- `/admin` ana web uygulamasında yoktu; port 3001 ayrı uygulamaya ayrılmıştı ve kullanıcı ortamında 3001 başka bir projede kullanılıyor.
- Public API yoktu; bu yüzden fiyat ve gerçek stok miktarı API seviyesinde de korunmuyordu.
- Admin kimlik kontrolü ve admin API koruması bulunmuyordu.
- Ürün yönetimi, import senkronizasyonu, yayınlama ve audit akışı gerçek veriye bağlanmamıştı.

## Port Denetimi

- `localhost:3000`: eski `/Users/zumerkekillioglu/Desktop/entas` Next.js süreci tarafından kullanılıyor. Bu ENTAS ailesinden eski/stale dev süreci olduğu için yalnızca yeni uygulamayı 3000'de başlatırken kapatılacak.
- `localhost:3001`: `/Users/zumerkekillioglu/Desktop/Canga/client` Vite süreci tarafından kullanılıyor. Bu proje dışı olduğu için dokunulmayacak.
- Bu çalışma sonunda ana site ve admin panel aynı Next.js uygulamasında çalışacak:
  - Public site: `http://localhost:3000`
  - Admin: `http://localhost:3000/admin`

## Güvenlik ve Veri Görünürlüğü

Public kullanıcı sadece ürün adı, marka, kategori, görsel, SKU ve durum bazlı stok bilgisi görmeli. Public görünümde aşağıdaki alanlar gizlenmeli:

- Net/liste fiyat
- İskonto
- Sepet ve ödeme akışı
- Gerçek stok adedi
- Bayi özel ticari bilgiler

Admin ve ileride onaylı bayi oturumu farklı yetki katmanları olarak ele alınmalı. Bu teslimatta admin için cookie tabanlı geliştirme girişi, public için fiyat/stok maskeleme uygulanacak.

## Üretim Öncesi Riskler

- Bu sürüm dosya tabanlı katalog deposu kullanır; gerçek üretimde PostgreSQL/Prisma migration ile kalıcı modele taşınmalıdır.
- Admin girişi yerel geliştirme için environment değişkenleriyle çalışır; üretimde hashli parola, kullanıcı tablosu, rol ve oturum yenileme eklenmelidir.
- Sipariş, ödeme, gerçek bayi fiyat grupları ve ERP entegrasyonları temel arayüz/plan seviyesindedir; tam ticari üretim için ayrıca tamamlanmalıdır.
- Tedarikçi görsel URL'lerinin erişilebilirliği dış servislere bağlıdır.
