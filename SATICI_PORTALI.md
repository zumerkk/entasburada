# ENTAŞBURADA Satıcı ve Dropshipping Kanalı

## Amaç

Satıcı kanalı; ENTAŞBURADA’dan ürün alıp kendi mağazasında satan bayilere ve ürünün doğrudan son müşteriye gönderildiği dropshipping iş ortaklarına tek bir kontrollü çalışma alanı sağlar. Katalog, fiyat, stok ve sipariş aynı ticari veri kaynağını kullanır.

## Yetki modeli

Her bayi hesabında ayrı bir `sellerAccess` profili bulunur:

| Yetki | Etki |
| --- | --- |
| Satıcı paneli | `/satici` çalışma alanına giriş |
| Ürün beslemesi | Oturum veya API ile JSON, CSV ve XML ürün verisi |
| Net stok | Güvenli stok aralığı yerine tam adet |
| API | Bearer API anahtarı ile sunucudan sunucuya erişim |
| API siparişi | `POST /api/reseller/v1/orders` ile sipariş açma |
| Kör kargo | Pakette ENTAŞBURADA fiyat/fatura/marka evrakı olmadan sevkiyat talebi |

Hesap tipi `reseller`, `dropshipping` veya `hybrid` olabilir. API anahtarı SHA-256 özetiyle saklanır; düz anahtar yalnızca oluşturma/yenileme yanıtında gösterilir. Şifre yenilenince mevcut müşteri oturumları geçersiz olur.

## Fiyat politikası

- Standart bayi/toptan müşteri fiyatı mevcut marka ve kaynak fiyat kurallarıyla hesaplanır.
- Satıcı, dropshipping ve hibrit hesapların KDV dahil alış fiyatı, standart bayi net fiyatının sabit `%20` üzeridir.
- Bu kanal farkı ürün sayfası, hızlı sipariş, sepet, teklif, panel, JSON/XML/CSV beslemesi ve API siparişinde aynı merkezi fiyat motorundan uygulanır.
- `defaultMarkupRate`, ENTAŞBURADA'nın `%20` kanal farkı değildir; satıcının kendi mağazası için önerilen satış fiyatını hesaplayan ayrı ve yönetilebilir kâr oranıdır.
- Geçmişte oluşmuş sipariş fiyatları değiştirilmez; yeni fiyat hesapları ve yeni siparişler güncel politikayı kullanır.

## Admin akışı

1. `/admin/dealers` ekranındaki “Doğrudan satıcı / dropshipping hesabı aç” formu doldurulur.
2. Panel güçlü bir geçici şifre üretir, isteğe göre hoş geldin e-postasını gönderir ve API anahtarını tek sefer gösterir.
3. Hesap listesinden kanal tipi, durum, net stok, besleme, sipariş API’si, kör kargo ve varsayılan kâr oranı yönetilir.
4. Gerekirse geçici şifre veya API anahtarı yenilenir. Eski bilgi anında geçersiz olur.
5. Dropshipping siparişlerinde alıcı, mağaza sipariş numarası ve kör kargo bilgisi admin sipariş detayında ve sevk fişinde görünür.

## Ürün API’si

`GET /api/reseller/v1/products`

Kimlik doğrulama:

```http
Authorization: Bearer entas_live_...
```

Parametreler:

- `q`: SKU, barkod, üretici kodu, ürün, marka veya kategori araması
- `stock`: `all`, `available`, `low_stock`, `incoming`, `out_of_stock`
- `page`: JSON sayfası
- `limit`: JSON için 1–250
- `format`: `json`, `csv`, `xml`

Fiyatlar satıcının KDV dahil kanal alış fiyatıdır. `recommendedSalePrice`, bu kanal alış fiyatının üzerine adminin tanımladığı önerilen mağaza kârı uygulanarak bilgilendirme amacıyla hesaplanır. `availableQuantity`, yalnızca net stok yetkisi açıksa doludur. `orderable` alanı aktif fiyat ve siparişe uygun stok birlikte bulunduğunda `true` olur.

## Sipariş API’si

`POST /api/reseller/v1/orders`

```json
{
  "externalOrderId": "TY-104582",
  "recipient": {
    "name": "Ayşe Yılmaz",
    "phone": "05320000000",
    "city": "Ankara",
    "address": "Örnek Mah. 10. Sok. No: 3 Çankaya/Ankara"
  },
  "blindShipping": true,
  "note": "Teslimattan önce arayın",
  "items": [
    { "sku": "SKU-001", "quantity": 2 }
  ]
}
```

Sipariş açılırken ürünün aktif/yayında olması, SKU’nun tekil eşleşmesi, fiyatın bulunması, minimum sipariş miktarı ve bilinen mevcut stok kontrol edilir. Aynı hesapta aynı `externalOrderId` yeniden gönderilirse mevcut sipariş döner; ikinci sipariş oluşmaz.

## Operasyon ve üretim notları

- Uygulamanın çalışan ticari repository katmanı halen dosya tabanlıdır. Prisma şemasına `SellerAccess` ve dropshipping sipariş alanları eklendi; çoklu sunucu üretiminde repository katmanı PostgreSQL’e alınmalıdır.
- API siparişinde stok anlık doğrulanır, sipariş operasyonu “stok kontrol bekliyor” durumunda açılır. Kesin rezervasyon için tedarikçi/ERP stok düşümünün transaction veya rezervasyon servisine bağlanması gerekir.
- Pazaryeri durum geri bildirimleri için bir sonraki katman imzalı webhook, kargo takip webhook’u ve hata/teslimat tekrar kuyruğudur.
- API anahtarları tarayıcı JavaScript’ine veya mobil uygulamaya gömülmemeli; yalnızca satıcının sunucusunda sır olarak saklanmalıdır.
- CSV çıktısı formül enjeksiyonuna karşı korunur; XML değerleri escape edilir. Ticari yanıtlar `private, no-store` ile sunulur ve istek hızları sınırlandırılır.
