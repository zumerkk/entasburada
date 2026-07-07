# ENTAŞBURADA Uygulama Planı

Tarih: 2026-07-07

## Hedef

İthal edilen ürünleri demo veriden ayırıp gerçek katalog deposuna almak, admin onayı/yayın yaşam döngüsüyle public sitede görünür kılmak, fiyat ve gerçek stok bilgisini public seviyede gizlemek, admin paneli ana uygulamada `/admin` altında çalıştırmak.

## Faz 1 - Denetim ve Port Güvenliği

- Proje dosya yapısı ve çalışan servisleri denetle.
- 3000 portunu kullanan eski ENTAS dev sürecini sadece başlangıç aşamasında kapat.
- 3001 portunda çalışan proje dışı Canga sürecine dokunma.

## Faz 2 - Katalog Domain Paketi

- `@entas/catalog` paketi ekle.
- Import satırını katalog kaydına dönüştür.
- Yeni import ürünlerini varsayılan olarak `DRAFT` üret.
- Admin yayın aksiyonu ile ürünleri `ACTIVE` ve public görünür yap.
- Public DTO'da fiyatı ve gerçek stok adedini kaldır.
- Admin DTO'da fiyat ve gerçek stok bilgisini göster.
- Unit testlerle fiyat gizleme, stok maskeleme, taslak/yayın akışı ve audit üretimini doğrula.

## Faz 3 - Dosya Tabanlı Katalog Deposu

- `data/import-results/supplier-products.json` kaynağından `data/catalog-store.json` üret.
- `data/audit-log.json` içine sync/yayın olaylarını yaz.
- `pnpm catalog:sync` komutu ekle.
- İlk yükleme için `pnpm catalog:sync -- --publish` ile mevcut 2.960 ürünü admin seed onayıyla public yayına al.

## Faz 4 - Public Site Entegrasyonu

- Ana sayfa, katalog ve ürün detay sayfalarını demo array yerine katalog deposundan okut.
- Arama, kategori, marka, kaynak, stok ve sayfalama filtrelerini gerçek veriye bağla.
- Public API `/api/products` fiyat ve gerçek stok adedi döndürmeyecek.
- `/api/health` servis durumunu ve ürün sayaçlarını döndürecek.

## Faz 5 - Admin Panel

- Ana web uygulaması altında `/admin/login`, `/admin`, `/admin/products`, `/admin/import` rotaları ekle.
- Geliştirme admin bilgileri:
  - E-posta: `admin@entasburada.com`
  - Şifre: `Entasburada2026!`
- Admin ürün listesinde gerçek fiyat, gerçek stok, durum ve yayın aksiyonları göster.
- Import merkezinde son import raporu, senkronizasyon, toplu yayın ve audit log göster.
- Admin API `/api/admin/products` cookie kontrolü olmadan veri döndürmeyecek.

## Faz 6 - Doğrulama

- `pnpm import:suppliers`
- `pnpm catalog:sync -- --publish`
- `pnpm typecheck`
- `pnpm test`
- `pnpm build`
- `pnpm db:validate`
- Local smoke test:
  - `http://localhost:3000/api/health`
  - `http://localhost:3000/catalog`
  - `http://localhost:3000/admin/login`
  - Public HTML/API çıktısında fiyat ve gerçek stok adedi olmadığını kontrol et.

## Teslim Kriteri

- Ürünler import sonrası admin onaylı katalog deposuna düşer.
- Public katalogda gerçek ithal ürünler görünür.
- Public kullanıcıya fiyat/sepet/ödeme kapalıdır.
- Admin panel ve normal site aynı katalog kaynağından çalışır.
- Son durum `FINAL_STATUS.md` içinde belgelenir.
