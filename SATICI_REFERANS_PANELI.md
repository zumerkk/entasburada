# Yetkili Panel — referans ve komisyon sistemi

## Kullanım

- `/satici`: satıcı ana ekranı, kişiye özel referans kodu/bağlantısı, müşteri listesi ve ürün bazında kazanç dökümü.
- `/satici/musteri`: oturumdaki satıcıya bağlı müşteri başvurusu. Satıcı kimliği sunucudan alınır; formda başka kod göndermek atamayı değiştirmez.
- `/dealer-application?ref=ENT-…`: mevcut genel kayıt formu; referans isteğe bağlıdır. Hatalı/pasif kod reddedilir, boş bırakılabilir.
- `/admin/dealers`: mevcut hesap oluşturma/onaylama ekranı. Satıcı kaynağı hem başvuruda hem müşteri hesabında görünür.
- `/admin/sellers`: satıcı listesi, komisyonlar, dekontla ödeme kaydı, ürün bazında iade ve geri tahsilat kaydı.
- `/satici/katalog`: önceki satıcı katalog/dropshipping/entegrasyon ekranı korunur.
- `/api/seller/commissions`: yalnızca oturumdaki satıcının komisyon CSV dosyası; formül enjeksiyonuna karşı hücre kaçışı içerir.

Eren hesabını yönetici panelinden gerçek e-posta/firma/telefon bilgileriyle oluşturun. Yetkili kişi adı Eren olursa başlık ve müşteri kaynak etiketi “Yetkili Panel: Eren” olur. Yerel görsel testte kullanılan Eren hesabı yalnızca `/tmp/entas-seller-preview` içindeki sahte test verisidir; canlı bir hesap oluşturulmamıştır.

## Kurallar

Komisyon yeni sipariş oluşturulurken müşterinin onaylı hesabındaki referanstan, her ürünün KDV dahil satır tutarının %10'u olarak anlık görüntülenip saklanır. Kargo ve ödeme sağlayıcısı masrafları matraha dahil edilmez. Satır bazında kuruşa yuvarlanır. Para birimleri ayrı tutulur. Eski siparişler geriye dönük komisyonlandırılmaz; mevcut müşteri hesabına sonradan referans eklenmez.

Müşteri başvurusu mevcut bayi onayından geçer. Yönetici onayında referans hesap üzerine taşınır. Mevcut e-posta adresi yeniden referansla kaydedilemez, kişi kendisine referans olamaz. Firma çalışanı ayrı satıcı sayılmaz; yeni davet edilen çalışanlara satıcı/API yetkileri kopyalanmaz. Müşteri firmasının davetli çalışanları müşteri referansını devralır.

Tahsilat ve teslimat tamamlanana kadar komisyon bekler. Sipariş `DELIVERED` / `COMPLETED` ve ödeme durumu `PAID`, `Ödendi`, `Odendi`, `Tahsil edildi`, `Ödeme alındı` veya mevcut ZiraatPay callback'indeki `Kartla ödendi (ZiraatPay)` olduğunda ödenebilir. Serbest metinde belirsiz ifadeler ödenebilir sayılmaz.

Banka transferi otomatik yapılmaz. Yönetici gerçek transferden sonra dekont referansıyla ödeme kaydeder. Sipariş revizyonu ve ortak ticari işlem kilidi aynı ödemenin tekrar kaydını engeller. Ürün iadesi, önceki iadeden az veya satın alınan adetten fazla olamaz. Tam iptal/iade kazancı sıfırlar; önceden ödenmiş tutar silinmez, geri alınacak bakiye gösterilir. Gerçek geri tahsilattan sonra yönetici ayrı dekontla negatif ödeme kaydı ekler. İşlemler sipariş geçmişine yazılır.

## Veri ve işletim

Uygulamanın aktif çalışma deposu Prisma değil, `data/customer-accounts.json`, `data/dealer-applications.json` ve `data/orders.json` dosyalarıdır. Yeni alanlar opsiyoneldir, eski kayıtlar okunabilir. Ticari işlemler `commercial-mutation.lock` ile aynı veri dizinindeki süreçler arasında kilitlenir; her dosya atomik yeniden adlandırmayla yazılır. Süreç kilitliyken çökerse kilit otomatik çalınmaz. Tüm yazıcı süreçlerin durduğu doğrulanıp yedek alındıktan sonra yöneticinin artık kilidi kaldırması gerekir. JSON deposu için kalıcı disk ve tek uygulama örneği kullanılmalıdır. Çok sunuculu çalışma için tüm hesap/başvuru/sipariş işlemlerinin transactional veritabanına taşınması ayrı çalışma gerektirir.

## Doğrulama

Referans çözümleme, sunucudan satıcı atama, isteğe bağlı kod, pasif satıcı/kendi kendine referans/çalışan engeli, bayi onayında referansın korunması, ürün komisyonu, ZiraatPay tahsilatı, kısmi/tam iade, eşzamanlı ödeme ve dosya kilidi testleri eklenmiştir. Masaüstü ve 390 px mobil görünüm izole yerel örnekte kontrol edilmiştir.

Canlı ortama dağıtım ve gerçek Eren hesabının oluşturulması bu değişikliklerle otomatik yapılmaz.
