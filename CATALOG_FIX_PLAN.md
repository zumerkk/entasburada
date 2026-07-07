# ENTAŞBURADA Katalog ve Admin Düzeltme Planı

Tarih: 2026-07-07

## Admin Planı

- `/admin/quotes` route'u eklenecek.
- `/admin/orders` route'u eklenecek.
- Eski `/admin#quotes` ve `/admin#orders` linkleri client-side redirect ile yeni route'lara taşınacak.
- Admin menüsü hash link yerine gerçek route kullanacak.
- `/api/admin/quotes` ve `/api/admin/orders` endpointleri eklenecek.
- Veri yoksa boş beyaz ekran yerine açıklayıcı empty state gösterilecek.
- API yetki kontrolü mevcut admin cookie ile yapılacak.

## Katalog Planı

- Hardcoded kategori menüsü yerine katalog deposundan ve merkezi kategori sözlüğünden üretilen navigasyon kullanılacak.
- “Ana Katalog / Tüm Ürünler” CTA'sı header, mega menü, mobil header, hero, hızlı katalog ve footer alanlarında görünür olacak.
- Hızlı katalog kartları gerçek ürün sayılarıyla üretilecek.
- Kategori filtresi doğrudan sonuç bulamazsa:
  - kategori alias/ana grup eşleşmesi denenecek,
  - alt/ilişkili kategori anahtarları denenecek,
  - hâlâ sonuç yoksa anlamlı fallback mesajıyla tüm aktif ürünlere dönülecek.
- Türkçe karakterli slug ve label eşleşmeleri merkezi normalize fonksiyonu üzerinden çalışacak.
- Public API `/api/products` aynı kategori/group/fallback mantığını kullanacak.
- Development ortamında katalog sorgu debug metriği loglanacak.

## Test Planı

- Catalog group eşleşmesi ve kategori fallback unit testleri.
- Invalid page/offset fallback testi.
- Admin hash backward compatibility unit testi.
- `/api/products` public mask ve grup filtresi smoke testi.
- `/api/admin/quotes` ve `/api/admin/orders` yetki smoke testi.
