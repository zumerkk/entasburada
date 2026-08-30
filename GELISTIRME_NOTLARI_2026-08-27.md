# ENTAŞBURADA B2B Geliştirme Notları

Tarih: 27 Ağustos 2026

Bu çalışma mevcut local proje üzerinde yapıldı. Eski GitHub sürümüne dokunulmadı ve commit/push yapılmadı.

## Local çalıştırma

```bash
cd /Users/zumerkekillioglu/Downloads/entasburada
pnpm install
pnpm dev:web
```

Uygulama: http://localhost:3000

Test bayi hesabı giriş ekranında da gösterilir:

- E-posta: `bayi1@entasburada.com`
- Şifre: `Bayi2026!`

Admin girişi: http://localhost:3000/admin/login

Admin bilgileri için `apps/web/.env.local` içindeki `ADMIN_EMAIL` ve `ADMIN_PASSWORD` kullanılır.

## 1. Akıllı ürün arama

Eklenenler:

- Yazım hatası toleransı ve Levenshtein tabanlı bulanık eşleşme.
- Ürün adı, kategori, marka, teknik özellik ve açıklama için ağırlıklı sonuç sıralaması.
- Teknik eş anlamlı grupları: spiral/fleks/flex hortum, batarya/musluk/mix, vana/valf, conta/o-ring vb.
- Header içinde yazarken ürün ve kategori önerisi.
- Ölçü, çap, bağlantı tipi, malzeme ve kullanım alanı filtreleri.
- Sonuç bulunamadığında sorgunun anlamlı kelimelerinden yakın alternatifler.
- Sonuçsuz arama raporunda otomatik katalog ürün önerileri.
- Gerçek arama davranışı ve yanlış pozitif eşleşmeler için regresyon testleri.

Başlıca dosyalar:

- `packages/catalog/src/index.ts`
- `apps/web/components/SearchAutocomplete.tsx`
- `apps/web/app/api/search/suggestions/route.ts`
- `apps/web/app/catalog/page.tsx`
- `apps/web/lib/catalog-repository.ts`

Manuel test:

1. Ana sayfadaki aramaya `batrya` yazın. “Yazım hataları düzeltilerek eşleştirildi” mesajı ve batarya ürünleri görünmeli.
2. `flex hortum`, `fleks` veya `spiral` arayın.
3. Katalog filtresinde “Teknik özellik filtreleri” bölümünü açın.
4. Ölçü için `25 mm`, bağlantı için `iç diş`, malzeme için `PPRC` gibi değerler deneyin.
5. `paslanmaz zzzzbulunmaz` araması yakın alternatifler göstermeli.

## 2. Proje ve malzeme listeleri

Eklenenler:

- Yeni şantiye/proje oluşturma.
- Elle ürün satırı girişi.
- XLSX, CSV ve TSV malzeme listesi yükleme.
- SKU ile birebir; ad ve teknik aramayla akıllı katalog eşleştirmesi.
- Eşleşmeyen satırlar için muadil seçimi.
- Eşleşen ürünleri tek seferde sepete ekleme veya toplu teklife dönüştürme.
- Proje teklif, sipariş ve sevkiyat geçmişi.

Sayfalar:

- http://localhost:3000/projects
- http://localhost:3000/projects/new

Örnek CSV:

```csv
Malzeme Kodu;Ürün Adı;Miktar;Birim;Hedef Fiyat;Not
KFK-061-1907;PPRC çiftli batarya bağlantısı;12;Adet;150;Acil
;Paslanmaz fleks hortum 150 cm;8;Adet;;Muadil olabilir
```

Başlıca dosyalar:

- `apps/web/lib/material-list-parser.ts`
- `apps/web/lib/project-repository.ts`
- `apps/web/app/projects/`

## 3. Gelişmiş teklif merkezi

Eklenenler:

- Teklif revizyon numarası ve eski revizyonların fiyat/tarih geçmişi.
- Geçerlilik süresi ve süresi geçen teklif durumu.
- PDF ve Excel çıktısı.
- Müşteri mesajı, satış temsilcisi notu ve revizyon talebi.
- Satır bazında kabul/red.
- Kabul edilen satırları kısmen siparişe çevirme.
- Kısmi sevkiyat tercihi.
- Teklif fiyatlandığında ve geçerlilik değiştiğinde bildirim kaydı.

Manuel test:

1. Bayi hesabıyla `/quote` üzerinden teklif oluşturun.
2. Admin `/admin/quotes` ekranından teklifi fiyatlandırın ve geçerlilik tarihi verin.
3. Teklif takip ekranında PDF ve Excel indirin.
4. Bazı satırları seçip onaylayın veya not yazarak revizyon isteyin.
5. Admin aynı teklifi yeniden fiyatlandırınca revizyon geçmişini kontrol edin.

Başlıca dosyalar:

- `apps/web/lib/commercial-repository.ts`
- `apps/web/app/quote/[code]/page.tsx`
- `apps/web/app/admin/quotes/[id]/page.tsx`
- `apps/web/app/api/quotes/[code]/export/route.ts`

## 4. Tekrar sipariş ve şablonlar

Eklenenler:

- Sepeti ihtiyaç oldukça, haftalık veya aylık şablon olarak kaydetme.
- Şablonu tek tıkla sepete aktarma.
- Favorilerdeki ürünleri topluca sepete ekleme.
- Hızlı sipariş ve teklif ekranında XLSX desteği.
- Mevcut “siparişi tekrar ver” akışı korunup yeni şablon sayfasına bağlandı.

Sayfa: http://localhost:3000/order-templates

Başlıca dosyalar:

- `apps/web/lib/order-template-repository.ts`
- `apps/web/app/order-templates/`
- `apps/web/app/cart/page.tsx`
- `apps/web/app/quick-order/page.tsx`

## 5. Gerçek stok ve termin

Eklenenler:

- Tüm ürünü stokta gösteren eski maskeleme kaldırıldı.
- Gerçek durum: stokta, düşük stok, bekleniyor veya tükendi.
- Güvenli stok aralığı; ham kesin adet müşteriye açılmaz.
- Depo bazında görünür stok bilgisi.
- Bugün kargoda / 1–2 iş günü / beklenen tarih gibi termin metni.
- Gelecek stok tarihi.
- Stok gelince haber ver butonu.
- Kısmi sevkiyat seçeneği ve stoklu alternatifler.

Manuel test:

1. Admin ürün düzenleme ekranından bir ürünü `incoming` veya `out_of_stock` yapın ve beklenen stok tarihi verin.
2. Ürün detayında durum, termin, depo ve “Stok gelince haber ver” alanlarını kontrol edin.
3. `in_stock` bir üründe güvenli stok aralığı ve teslim tahmini görünmeli.

## 6. Firma kullanıcıları ve sipariş onayı

Eklenen roller:

- Firma sahibi
- Satın alma yöneticisi/personeli
- Finans yetkilisi
- Sipariş onaylayıcı
- Depo teslim sorumlusu
- Görüntüleyici

Her kullanıcı için işlem limiti ve “sipariş yönetici onayı ister” kuralı tanımlanabilir. Limiti aşan veya onay gerektiren sipariş `DEALER_APPROVAL_PENDING` durumuna alınır; yetkili kullanıcı kabul veya red verebilir.

Sayfalar:

- http://localhost:3000/account/team
- http://localhost:3000/account/approvals

Not: Lokal e-posta servisi kapalıysa davet e-postası gönderilmez. Gerçek davet teslimi için SMTP veya Resend ayarları gerekir.

## 7. Yönetim analitiği

`/admin/analytics` ekranına eklenenler:

- Müşteri bazında satış ve dönüşüm hunisi.
- Tekliften siparişe dönüşüm oranı.
- Maliyet verisi olan ürünlerde gerçek kârlılık/marj alarmı.
- En çok aranan ama bulunamayan ürünler ve katalog önerileri.
- 90 gündür hareket görmeyen stok adayları.
- Müşteri kaybetme riski.
- Geciken tahsilat ve kredi limiti uyarısı.
- Otomatik kampanya/segment önerisi.
- Ürün veri kalite puanı.
- Kopya ürün ve yanlış kategori adayları.
- Satış temsilcisi performansı.

Admin ürün ekranına ayrıca toplu fiyat değişikliği uygulamadan önce örnek eski/yeni fiyat ön izlemesi eklendi.

Başlıca dosya: `apps/web/lib/business-intelligence.ts`

## Otomatik doğrulama

```bash
pnpm typecheck
pnpm test
pnpm build
pnpm smoke:commercial
```

`smoke:commercial` şunları uçtan uca doğrular:

- Public teklif oluşturma.
- Admin fiyatlandırma ve revizyon altyapısı.
- PDF/XLSX teklif çıktıları.
- Teklifi siparişe çevirme ve sipariş operasyonu.
- Bayi sepeti ve checkout.
- Yeni admin, proje, ekip, onay ve şablon sayfalarının açılması.
- Test sırasında değişen ticari JSON dosyalarının sonunda eski hâline dönmesi.

## Veri saklama

Yeni modüller mevcut projenin mimarisine uyumlu olarak local JSON repository katmanını kullanır. Proje, sipariş şablonu, teklif, sipariş, firma üyesi ve bildirim verileri ilk işlemde `data/` altında oluşur/güncellenir. Production veritabanına geçişte repository fonksiyonlarının Prisma uygulamalarıyla değiştirilmesi gerekir.
