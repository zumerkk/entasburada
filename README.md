# ENTAŞBURADA B2B Platform

Modern, bayi onaylı fiyat gösterimi üzerine kurulu hırdavat ve yapı market B2B ticaret platformu temeli.

## Kapsam

- `apps/web`: Public katalog, ürün detay, bayi başvuru, teklif talebi, `/admin` operasyon paneli ve fiyat gizleme deneyimi.
- `apps/admin`: Eski ayrı admin uygulaması; aktif geliştirme paneli ana uygulamadaki `/admin` rotasındadır.
- `apps/worker`: BullMQ tabanlı import, bildirim, analitik ve terk edilmiş sepet job iskeleti.
- `packages/database`: PostgreSQL/Prisma veri modeli.
- `packages/pricing-engine`: Decimal tabanlı, testlenebilir fiyat öncelik motoru.
- `packages/import-engine`: XML/CSV/XLSX iş akışları için streaming XML parser temeli.
- `packages/ui`: Web ve admin arasında paylaşılan B2B UI bileşenleri.

## Çalıştırma

```bash
pnpm install
cp .env.example .env
docker compose up -d
pnpm db:validate
pnpm db:generate
pnpm dev:web
```

Web: http://localhost:3000

Admin: http://localhost:3000/admin

Yerel geliştirme admin bilgisi:

```text
E-posta: admin@entasburada.local
Şifre: change-me-local-dev-only
```

Production/Vercel ortamında `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ADMIN_SESSION_SECRET`,
`AUTH_SECRET` ve `NEXT_PUBLIC_SITE_URL` env değerlerini gerçek değerlerle tanımlayın.

## Tedarikçi XML Import

İki XML kaynağını normalize edip sisteme almak için:

```bash
pnpm import:suppliers
pnpm catalog:sync -- --publish
```

Komut şu çıktıları üretir:

- `data/import-results/supplier-products.json`
- `data/import-results/supplier-products.csv`
- `data/import-results/import-report.json`
- `data/catalog-store.json`
- `data/audit-log.json`

Ham tedarikçi XML dosyaları `data/import-sources/` altında lokal/özel kaynak olarak tutulur ve public GitHub reposuna eklenmez.

Import fiyatları `priceVisibleToPublic: false` ile işaretler. `catalog:sync` komutu ürünleri katalog deposuna alır; `--publish` kullanılırsa seed admin onayıyla public katalogda görünür yapar.

## PostgreSQL / Prisma Hazırlığı

Prisma şeması ticari B2B yapıyı kapsar: bayi şirketleri, kullanıcılar, roller, katalog, fiyat kuralları, sepet, teklif, sipariş, sevkiyat, ödeme, bildirim, import job ve audit log.

Yerel PostgreSQL'e schema basmak için:

```bash
docker compose up -d postgres
pnpm db:validate
pnpm db:generate
pnpm db:push
```

Mevcut JSON ticari verilerini PostgreSQL'e aktarmak için:

```bash
pnpm db:import-commercial
```

Bu import `data/customer-accounts.json`, `data/quotes.json`, `data/orders.json`, `data/carts.json` ve `data/notifications.json` dosyalarını okur. Mevcut web uygulaması güvenli geliştirme için dosya tabanlı akışı korur; production geçişinde repository katmanı Prisma'ya bağlanacaktır.

## Canlı Smoke Test

Ticari akışı uçtan uca test etmek için web server açıkken:

```bash
pnpm dev:web
pnpm smoke:commercial
```

Smoke test public teklif oluşturur, admin fiyatlandırır, siparişe çevirir, sipariş operasyonunu günceller, bayi sepetinden direkt sipariş oluşturur ve sonunda test boyunca değişen JSON dosyalarını eski haline geri yükler.

## Kritik Ticari Kural

Onaylı bayi oturumu yoksa ürün fiyatı, indirim, sepet ve ödeme alanları görünmez. UI tarafında `PriceGate`, domain tarafında `calculateB2BPrice` aynı kuralı uygular.
