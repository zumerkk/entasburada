# ENTAŞBURADA Kategori Eşleme Raporu

Tarih: 2026-07-07

## Özet

Aktif public katalog ürünü: 2.960

Kategorisiz ürün: 0

Import verisi `category` ve `categoryPath` üzerinden geliyor. Gerçek Prisma `categoryId` ilişkisi henüz migration ile bağlanmadığı için bu teslimatta güvenli kategori sözlüğü ve alias/fallback eşlemesi uygulandı.

## ENTAS Katalog Grupları

| Grup | URL | Ürün |
| --- | --- | ---: |
| Tüm Ürünler | `/catalog` | 2.960 |
| Hırdavat ve Bağlantı Elemanları | `/catalog?group=tesisat-baglanti-elemanlari` | 907 |
| Musluklar ve Bataryalar | `/catalog?group=musluk-batarya` | 873 |
| Duş, Banyo ve Vitrifiye | `/catalog?group=dus-banyo` | 652 |
| Pompa ve Su Sistemleri | `/catalog?group=pompa-su-sistemleri` | 185 |
| Hortum ve Flex | `/catalog?group=hortum-flex` | 265 |
| Aksesuar ve Yedek Parça | `/catalog?group=aksesuar-yedek-parca` | 678 |
| El Aletleri | `/catalog?group=el-aletleri` | 318 |
| Oto Servis Ekipmanları | `/catalog?group=oto-servis-ekipmanlari` | 304 |
| Bahçe ve Tarım | `/catalog?group=bahce-tarim` | 441 |
| Elektrikli El Aletleri | `/catalog?group=elektrikli-el-aletleri` | 153 |
| İş Güvenliği | `/catalog?group=is-guvenligi` | 115 |
| Kampanyalı Ürünler | `/catalog?group=kampanyali-urunler` | 2.960 |
| Yeni Ürünler | `/catalog?group=yeni-urunler` | 2.960 |
| Çok Satanlar | `/catalog?group=cok-satanlar` | 2.960 |

## En Büyük Kaynak Kategorileri

- SARI FİTTİNGSLER: 217
- PPRC FİTTİNGSLER: 100
- GALVENİZ FİTTİNGSLER: 94
- TAHRAT MUSLUKLARI: 90
- BANYO AKSESUARLARI: 87
- KAPLİN PUŞVİT FİTTİNGSLER: 87
- SU FLEX HORTUMLARI: 84
- SİYAH FİTTİNGSLER: 66
- Dalgıç Pompalar: 63
- BATARYALAR: 56
- KELEPÇELER: 55
- EL DUŞLARI: 55
- PVC FİTTİNGSLER: 54
- BATARYA YEDEK PARÇALARI: 48

## Düzeltme Kuralı

- Kullanıcı `/catalog` açarsa tüm aktif ürünler listelenir.
- Kullanıcı `group` parametresiyle ana kategori açarsa kategori sözlüğü kullanılır.
- Kullanıcı eski/hardcoded kategori adıyla gelirse alias çözümleme yapılır.
- Doğrudan eşleşme yoksa ilgili fallback anahtarları denenir.
- Hâlâ sonuç yoksa kullanıcıya mesaj gösterilerek tüm aktif ürünler listelenir.

Public kullanıcıya fiyat ve gerçek stok adedi gösterilmez; bu kural kategori fallback akışında da korunur.
