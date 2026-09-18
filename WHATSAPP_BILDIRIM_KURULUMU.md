# WhatsApp Sipariş Bildirimi — Kurulum

Sipariş düştüğü anda operasyon ekibine WhatsApp mesajı gider. SMS altyapısı kurulmadı; yerine
WhatsApp kullanılıyor.

**Varsayılan alıcılar:** +90 541 381 21 14 · +90 540 123 71 71
(`ORDER_ALERT_WHATSAPP` ile değiştirilebilir, virgülle ayırın.)

**Tetiklenme noktası:** `convertQuoteToOrder` — yani sepetten sipariş, teklif onayı, admin
panelinden dönüştürme ve satıcı/dropshipping API'si dahil **tüm sipariş yolları** tek noktadan
geçtiği için hepsi bildirim üretir. Gönderim beklenmez; WhatsApp hata verse bile sipariş düşer.

İki yol var. **Cloud API önerilir**, köprü yedek/geçici çözümdür.

---

## Yol A — Meta WhatsApp Cloud API (resmi, önerilen)

### A0. Numara seçimi — önce bunu okuyun

Alacağınız sanal numara için iki uyarı:

- Numara **WhatsApp'a kayıtlı olmamalı.** Hâlihazırda WhatsApp'ta kullanılan bir numarayı Cloud
  API'ye bağlayamazsınız (önce o hesabı silmek gerekir).
- **Meta, VoIP/sanal numaraların çoğunu doğrulamada reddeder.** En garanti yol ucuz bir ön ödemeli
  fiziksel hat almak. Sanal numara alacaksanız, satın almadan önce sağlayıcıya "WhatsApp Business
  API doğrulaması yapılabiliyor mu" diye sorun ve SMS **veya sesli arama** ile kod alabildiğinden
  emin olun.

> Köprü (Yol B) için bu kısıt yok — normal WhatsApp'a kaydedilebilen her numara çalışır.

### A1. Meta tarafı

1. [business.facebook.com](https://business.facebook.com) → İşletme hesabı oluşturun/doğrulayın.
2. [developers.facebook.com](https://developers.facebook.com) → **Create App** → tür: **Business**.
3. Uygulamaya **WhatsApp** ürününü ekleyin → WhatsApp Business Account oluşur.
4. **API Setup** ekranından **Add phone number** ile sanal numaranızı ekleyip doğrulayın.
5. Aynı ekrandaki **Phone number ID** değerini not alın → `WHATSAPP_PHONE_NUMBER_ID`.

### A2. Kalıcı token (geçici token 24 saatte ölür)

1. Business Settings → **Users → System Users** → **Add** → rol: Admin.
2. **Assign assets** → WhatsApp Business Account'u tam yetkiyle atayın.
3. **Generate new token** → uygulamayı seçin → izinler: `whatsapp_business_messaging` +
   `whatsapp_business_management` → **Expiration: Never**.
4. Çıkan token → `WHATSAPP_TOKEN`. (Bir daha gösterilmez, kaydedin.)

### A3. Şablon oluşturma — **bu adım zorunlu**

WhatsApp'ta işletmenin kendi başlattığı mesajlar ancak **Meta tarafından onaylanmış şablonla**
gönderilebilir. Onaysız düz metin gönderemezsiniz.

WhatsApp Manager → **Account tools → Message templates → Create template**:

| Alan | Değer |
|---|---|
| Name | `yeni_siparis` |
| Category | **Utility** (Marketing seçmeyin — onay zorlaşır) |
| Language | Türkçe (`tr`) |

**Body** (birebir bu metni yapıştırın — kodun gönderdiği 5 değişkenle eşleşir):

```
🛒 Yeni sipariş: {{1}}
Firma: {{2}}
Tutar: {{3}}
Kalem: {{4}}
Yetkili: {{5}}
```

**Buttons** → *Call to action* → *Visit website* → **Dynamic**:

```
https://entasburada.com/admin/orders/{{1}}
```

Örnek değerler istendiğinde: `SIP-20260917-0004`, `ABC İnşaat Ltd. Şti.`, `12.500,00 TRY`,
`5 adet / 2 kalem`, `Ahmet Yılmaz · +90 532 000 00 00`, buton için `order-9f21`.

Onay genelde birkaç dakika–birkaç saat sürer. Durum **Active** olmadan mesaj gitmez.

> Şablonu farklı adla oluşturursanız `WHATSAPP_TEMPLATE_NEW_ORDER` değerini ona göre girin.
> Değişken sayısını değiştirirseniz `apps/web/lib/order-alerts.ts` içindeki
> `buildOrderAlertParams` fonksiyonunu da güncelleyin.

### A4. Alıcıları tanıtın

Uygulama "Development" modundayken yalnızca **API Setup → To → Manage phone number list**
altına eklenmiş numaralara mesaj gider. İki operasyon numarasını oraya ekleyin ve gelen
doğrulama kodunu girin. Canlıya geçince (App Review / Live) bu kısıt kalkar.

Alıcı telefonlarda WhatsApp kurulu olmalı.

### A5. Ortam değişkenleri

Render → Service → **Environment**:

```
WHATSAPP_PROVIDER=cloud
WHATSAPP_PHONE_NUMBER_ID=<A1'deki id>
WHATSAPP_TOKEN=<A2'deki kalıcı token>
WHATSAPP_TEMPLATE_NEW_ORDER=yeni_siparis
WHATSAPP_TEMPLATE_LANG=tr
ORDER_ALERT_WHATSAPP=+90 541 381 21 14, +90 540 123 71 71
```

Kaydedip servisi yeniden başlatın.

---

## Yol B — WhatsApp Web köprüsü (`services/whatsapp-bridge`)

Numaranızı QR ile bağlayan küçük bir servis. Şablon onayı, Meta hesabı ve mesaj ücreti yok;
düz metin gönderir.

**Riski açıkça söyleyelim:** Bu, resmi API değil — WhatsApp Web oturumunu otomatikleştirir.
Meta'nın kullanım şartlarına aykırıdır ve numara **kalıcı olarak kapatılabilir.** Şirketin ana
numarasını buraya bağlamayın; feda edilebilir ayrı bir hat kullanın. Kalıcı çözüm olarak Yol A'yı
kurun, bunu köprü/geçiş dönemi için tutun.

### B1. Render'da ikinci servis

- **New → Web Service** → aynı repo
- Runtime: **Docker**, Dockerfile path: `services/whatsapp-bridge/Dockerfile`
- Docker build context: `services/whatsapp-bridge`
- Disk ekleyin: mount `/var/data`, 1 GB *(oturum burada saklanır; disk olmadan her deploy'da
  yeniden QR okutmanız gerekir)*
- Environment:
  ```
  WHATSAPP_BRIDGE_TOKEN=<uzun rastgele bir parola>
  SESSION_DIR=/var/data/wa-session
  ```

### B2. QR okutma (tek seferlik)

Servis açıldığında **Logs** sekmesinde QR kodu ASCII olarak basılır. Telefondan
**WhatsApp → Ayarlar → Bağlı cihazlar → Cihaz bağla** ile okutun. Log'da `WhatsApp bağlantısı hazır`
görünce tamamdır.

Logdan okuyamazsanız: `GET /qr` (Bearer token ile) ham QR metnini döner.

### B3. Ana uygulamayı köprüye bağlayın

Ana servisin Environment'ına:

```
WHATSAPP_PROVIDER=bridge
WHATSAPP_BRIDGE_URL=https://entas-whatsapp-bridge.onrender.com
WHATSAPP_BRIDGE_TOKEN=<B1'deki parola>
```

> Köprü servisini mümkünse dışarı kapalı (private service) tutun; herkese açıksa token'ı uzun
> tutun — o token mesaj göndermeye yeter.

---

## Kurulumu test etme

**1) Yapılandırmayı görün.** Admin panelinde oturum açıkken tarayıcıda açmanız yeterli:

```
https://entasburada.com/api/admin/whatsapp-test
```

`provider`, `configured`, `template` ve çözümlenmiş `recipients` listesini döner. `provider: "off"`
görüyorsanız değişkenler servise ulaşmamış demektir.

**2) Gerçek test mesajı gönderin.** Aynı adrese POST atın (tarayıcı konsolundan, admin sekmesi
açıkken):

```js
await fetch("/api/admin/whatsapp-test", { method: "POST" }).then((r) => r.json())
```

Terminalden yapacaksanız admin çerezi production'da `__Host-entas_admin_session` adıyla durur:

```bash
curl -s -X POST -b "__Host-entas_admin_session=<cookie>" https://entasburada.com/api/admin/whatsapp-test
```

Her alıcı için `ok` / `error` döner. Sık görülen hatalar:

| Hata | Anlamı |
|---|---|
| `Template name does not exist` | Şablon adı/dili tutmuyor ya da henüz Active değil |
| `Recipient phone number not in allowed list` | A4 adımı yapılmadı |
| `(#131030)` | Aynı — numara test listesinde değil |
| `Invalid OAuth access token` | Token süresi doldu; kalıcı System User token'ı üretin |
| `WhatsApp oturumu hazır değil` | Köprüde QR okutulmamış veya oturum düşmüş |

Gönderim sonuçları sunucu loglarına da yazılır: `[order-alert] SIP-… → 9054… gönderildi.`

---

## Karşılaştırma

| | Cloud API | WhatsApp Web köprüsü |
|---|---|---|
| Resmî / güvenli | ✅ | ❌ numara kapatılabilir |
| Şablon onayı | Gerekli | Gerekmez |
| Numara koşulu | WhatsApp'a kayıtlı **olmamalı**, VoIP çoğu kez reddedilir | Normal WhatsApp numarası |
| Mesaj ücreti | Utility şablonu başına kuruş mertebesinde | Yok |
| Kurulum süresi | Yarım–bir gün (doğrulama + şablon onayı) | ~1 saat |
| Bakım | Token dışında yok | Oturum düşerse QR tekrar okutulur |

---

## Değiştirilen / eklenen dosyalar

| Dosya | İş |
|---|---|
| `apps/web/lib/whatsapp.ts` | Sağlayıcı bağımsız gönderim (cloud / bridge / off) |
| `apps/web/lib/order-alerts.ts` | Sipariş mesajının içeriği, alıcı listesi, tekrar koruması |
| `apps/web/lib/commercial-repository.ts` | Sipariş oluşunca bildirimi tetikler |
| `apps/web/app/api/admin/whatsapp-test/route.ts` | Kurulum kontrolü ve test mesajı |
| `services/whatsapp-bridge/` | WhatsApp Web köprüsü (ayrı servis) |
| `.env.example`, `render.yaml` | Ortam değişkenleri |

## Notlar

- Alıcı numara son 24 saat içinde işletme numarasına mesaj attıysa şablon yerine düz metin de
  gider ve ücretlendirilmez; bu "servis penceresi" 24 saatte kapanır. Bildirimi buna bağlamayın —
  şablon her durumda çalışır.
- `WHATSAPP_PROVIDER` boş bırakılırsa: Cloud API bilgileri varsa `cloud`, yoksa köprü adresi varsa
  `bridge`, hiçbiri yoksa `off` seçilir. `off` durumunda sistem sessizce çalışmaya devam eder.
- Bildirim başka olaylara da (kargoya verildi, ödeme alındı) genişletilebilir: yeni bir şablon
  açıp `order-alerts.ts` içindeki desene göre çağırmak yeterli.
