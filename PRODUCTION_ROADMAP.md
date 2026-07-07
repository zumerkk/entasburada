# ENTAŞBURADA Production Roadmap

Tarih: 2026-07-07

## Tamamlanan Üretim Hazırlıkları

### PostgreSQL / Prisma Hazırlık Katmanı

- Prisma şeması mevcut canlı ticari sözleşmeyi taşıyacak şekilde genişletildi:
  - teklif takip kodu, müşteri iletişimi, toplam tutar, temsilci, geçmiş ve legacy payload
  - sipariş takip kodu, finans/stok/sevkiyat durumları, depo, kaynak, toplam tutar ve legacy payload
  - sepet ve bildirim legacy aktarım alanları
- `@entas/database` gerçek `PrismaClient` singleton export edecek hale getirildi.
- `pnpm db:push` ve `pnpm db:studio` komutları eklendi.
- `pnpm db:import-commercial` komutu eklendi; mevcut JSON müşteri/teklif/sipariş/sepet/bildirim verisini PostgreSQL'e aktarır.
- `pnpm smoke:commercial` komutu eklendi; canlı ticari akışı uçtan uca test eder ve test verisini geri temizler.

## Sonra Yapılacak Kritik Hatırlatma

### PostgreSQL / Prisma Geçişi

Mevcut canlı teklif, sipariş, sepet, müşteri ve bildirim akışları dosya tabanlı kalıcı depolarla çalışıyor:

- `data/quotes.json`
- `data/orders.json`
- `data/carts.json`
- `data/customer-accounts.json`
- `data/notifications.json`

Üretim ölçeğine geçerken bu veri katmanı tamamen Prisma/PostgreSQL repository yapısına taşınmalı. Schema, client export ve JSON import altyapısı hazırlandı; sonraki büyük altyapı işi uygulama runtime'ında `commercial-repository`, `cart-repository`, `customer-auth` ve `notification-repository` katmanlarını Prisma repository'lere bağlamaktır.

## Bu Turda Tamamlananlar

- 3 test bayi hesabı eklendi.
- Test bayilere özel segment, marka, kategori ve özel net fiyat kuralları eklendi.
- Bayi girişi, bayi paneli, sepet, hızlı sipariş ve CSV/TSV toplu giriş akışı eklendi.
- Sepetten teklif oluşturma ve doğrudan sipariş oluşturma akışı eklendi.
- XML entegrasyon izleme paneli eklendi.
- Admin ve müşteri bildirim merkezi eklendi.

## Bilerek Sonraya Bırakılanlar

- ERP / muhasebe bağlantısı: Logo, Mikro, Nebim, Paraşüt veya özel yazılım entegrasyonu.
- Kargo / sevkiyat entegrasyonu: Yurtiçi, Aras, MNG, Sürat vb. takip no ve barkod akışı.
- Rol bazlı admin güvenliği: satış, finans, depo ve yönetici rolleri.
- Production deploy: domain, SSL, backup, loglama, hata izleme, staging/prod ayrımı.
