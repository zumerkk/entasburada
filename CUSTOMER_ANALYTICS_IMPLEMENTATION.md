# Customer Analytics Implementation

## Durum

Admin paneline satış zekası modülü eklendi. Ürün görüntüleme, arama, kategori gezme ve sepet aksiyonları event olarak yazılır.

## Dosyalar

- `apps/web/lib/analytics-repository.ts`
- `apps/web/components/AnalyticsTracker.tsx`
- `apps/web/app/admin/analytics/page.tsx`
- `apps/web/app/api/events/product-view/route.ts`
- `apps/web/app/api/events/search/route.ts`
- `apps/web/app/api/events/cart/route.ts`
- `apps/web/app/api/admin/analytics/*`
- `data/user-events.json`

## Raporlar

- Müşteri davranışları
- Ürün ilgi skoru
- Terk edilmiş sepetler
- Aranıp bulunamayan ürünler
- Satış fırsatı ve satış görev endpointleri

## Güvenlik

Public event endpointleri fiyat veya gerçek stok verisi döndürmez. Admin rapor endpointleri admin cookie ister.

## Test

- Product view event: 201
- Search miss event: 201
- Admin customer behavior: 200
- Product interest: 200
- Search misses: 200
