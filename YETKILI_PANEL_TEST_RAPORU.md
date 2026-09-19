# Yetkili Panel test raporu

Son kontrol: 17 Eylül 2026. Testler izole verilerle yapıldı; gerçek müşteri veya banka işlemi yapılmadı.

## Sonuç

- 33 test dosyasında 214 test başarılı.
- TypeScript kontrolü başarılı; değişikliklerde boşluk/hata kontrolü başarılı.
- Son sipariş formu düzeltmesi dahil üretim derlemesi başarılı. TypeScript ve tüm testler geçti.
- Kullanıcıya görünen panel adı Yetkili Panel olarak değiştirildi. Mevcut `/satici` adresleri korunuyor.

## Otomatik doğrulanan akışlar

- Yetkili panelinden müşteri başvurusu, sunucudaki Eren kimliğine bağlanıyor; istemcinin gönderdiği farklı kod bunu değiştiremiyor.
- Genel kayıt formunda referans isteğe bağlı. Geçerli kod bağlanıyor; hatalı/pasif kod, kendine referans ve mükerrer müşteri/firma engelleniyor.
- Başvuru yönetici listesine ve bildirimlere düşüyor. Onaydan sonra müşteri hesabında referans korunuyor.
- Gerçek kayıt depolarını kullanan bütünleşik testte 2.750 TL ürün toplamı 275 TL komisyon oluşturuyor; kargo komisyona eklenmiyor.
- Sonraki siparişler aynı yetkiliye bağlanıyor. Başka yetkili müşterileri ve CSV verileri birbirinden ayrılıyor.
- Tahsilat ve teslimat şartları, Türkçe büyük harfli ödeme durumları, mükerrer/eşzamanlı ödeme engeli kontrol edildi.
- Kısmi iade, tam iptal, ödeme geçmişinin korunması ve fazla ödenen komisyonun geri tahsilat bakiyesi kontrol edildi.
- Yetkisiz erişim, devre dışı yetkili, çalışan yetkileri ve bildirimlerin eşzamanlı yazılması kontrol edildi.

## Tarayıcıdan doğrulanan akış

İzole `/tmp/entas-seller-preview` ortamında test müşterisi kaydedildi, yönetici onayıyla hesaba dönüştürüldü ve müşterinin sepetinden sipariş oluşturuldu. `SIP-20260916-0002` siparişinde iki adet 1.250 TL ürün, toplam 2.500 TL ve Eren için 250 TL komisyon görüldü. Yönetici ekranında “Yetkili Panel: Eren” kaynağı doğrulandı. Ödeme durumu “ÖDENDİ”, sipariş durumu teslim edildi/tamamlandı olarak kaydedildi. Kaydetme sonrasında durum seçiminin güncel kalması doğrulandı.

Masaüstü ve 390 px mobil görünüm önceki ekran kontrolünde incelendi. Son dekont ve iade formu gönderimlerinin tarayıcıdan yeniden kontrolü, tarayıcı güvenlik politikası doğrulama hizmetinin erişimi engellemesi nedeniyle tamamlanamadı. Bu işlemlerin sunucu eylemleri ve hesap sonuçları otomatik bütünleşik testlerde başarılıdır.

## Testlerde düzeltilen sorunlar

- Büyük harfli Türkçe tahsilat ifadelerinin tanınmaması.
- Ödenmiş komisyonun sipariş durumu geriye alındığında yeniden bekleyen bakiyeye eklenmesi.
- Onaylı firmanın başka e-posta ile tekrar referans başvurusu yapabilmesi.
- Eşzamanlı bildirim kaydında bir bildirimin kaybolması.
- Yönetici sipariş formunun kayıt sonrası eski durum seçimini göstermesi.

## Kapsam sınırları

Canlı yayın, gerçek Eren hesabı, gerçek banka transferi ve dış e-posta teslimatı doğrulanmadı. Eren test hesabı yalnızca izole önizlemededir. Aktif dosya tabanlı depolama için kalıcı disk ve tek uygulama örneği gereklidir; işletim ayrıntıları SATICI_REFERANS_PANELI.md içindedir. Test başarısı bütün olası üretim koşullarında hatasızlık garantisi değildir.

## 19 Eylül 2026 — Yetkili müşteri onayı

41 dosyada 270 test başarılı; yeni akışın TypeScript kontrolü başarılı. Gerçek dosya depolarıyla yetkilinin kendi başvurusunu onaylaması, paralel tekrar onayın tek hesap üretmesi, giriş bilgilerinin çalışması, referansın korunması ve şifre değişimi sonrası geçici şifrenin gizlenmesi doğrulandı. Başka yetkilinin başvurusu, sahte başvuru kimliği, pasif/oturumsuz yetkili, reddedilmiş başvuru ve mevcut hesaba el koyma girişimleri engellendi. Yönetici tarafından sıfırlanan şifrenin eski değeri gösterilmiyor.
