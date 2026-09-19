# EnexAI

EnexAI ana yerleşimde bulunur; müşteri site içinde gezerken sağ alt köşeden açılır. `/enexai` tanıtım sayfasındaki 24 başlangıç kartı aynı asistanı ilgili soruyla açar.

## Bağlantı

Next.js sunucusunun ortamına veya yerel geliştirmede `apps/web/.env.local` dosyasına aşağıdaki değişkenleri tanımlayın. Anahtarı tarayıcıya veya `NEXT_PUBLIC_` değişkenlerine koymayın, sürüm kontrolüne eklemeyin.

```dotenv
OPENAI_API_KEY=<sunucuda tanımlanacak anahtar>
OPENAI_ENEX_MODEL=gpt-5.4-mini
OPENAI_ENEX_TTS_MODEL=gpt-4o-mini-tts
OPENAI_ENEX_VOICE=coral
```

Ortam değişikliklerinden sonra sunucuyu yeniden başlatın. Üretimde mevcut `AUTH_SECRET`, `ADMIN_SESSION_SECRET` ve `NEXT_PUBLIC_SITE_URL` yapılandırması da gerekir. Kullanılan modelin OpenAI projesinde erişilebilir olması ve proje limitlerinin yeterli olması gerekir.

Anahtar yoksa katalog modu çalışır. OpenAI yanıtı alınamazsa katalog verisine dayalı yardım sürer; arayüz yanıtın modunu belirtir. Anahtar olmadan üretilmiş OpenAI yanıtı veya ses varmış gibi gösterilmez.

## Alışveriş akışı

- Gerçek katalogda doğal dil, marka ve ürün kodu araması.
- Ürün sayfasına bağlı öneriler, benzer ve tamamlayıcı ürün adayları.
- Onaylı hesabın mevcut ticari fiyat kurallarına uygun ürün fiyatları.
- Stok etiketi ve satın alınabilirliğin katalogdan kontrol edilmesi.
- Sepet toplamı, eksik ürünler ve ücretsiz kargo eşiği hakkında yardım.
- Giriş yapan müşterinin kendi sipariş geçmişini görmesi.
- Önceki siparişten satırları seçip adetlerini değiştirerek mevcut sepete ekleme.
- Ürün kartından sepete ekleme; mevcut sepet doğrulamalarının korunması.
- Teklif, teknik belge, proje, hızlı sipariş, hesap ve destek ekranlarına geçiş.
- Sayfaya ve sepetteki değişikliklere bağlı, kapatılabilir yardım önerileri.
- Sohbet, keşif ve sipariş sekmeleri; hızlı sorular ve yeni sohbet.
- Kullanıcı başlatınca mikrofonla Türkçe dikte (tarayıcı desteğine bağlı).
- Kullanıcının açtığı OpenAI seslendirmesi; ses seviyesine bağlı ağız hareketi.
- Göz kırpan, el sallayan, bekleyen, dinleyen ve konuşan maskot.
- Mobil görünüm, klavye erişimi ve azaltılmış hareket tercihi.

Karşılaştırma ve proje danışmanlığı yalnızca mevcut katalog verileri ve müşterinin verdiği bilgiler kadar güvenilirdir. Eksik teknik uyumluluk, teslim tarihi, indirim veya stok bilgisi uydurulmamalıdır. Başlangıç kartları bu konularda sohbeti başlatır; ayrı bir stok tahmin sistemi, canlı çağrı merkezi veya otomatik satın alma oluşturmaz.

## Veri ve işlem sınırları

API anahtarı sunucuda kalır. Anonim ziyaretçiye bayi fiyatları ve siparişler gönderilmez. Müşteri bilgisi istek gövdesinden değil doğrulanmış oturumdan alınır. Modelin sepeti veya siparişi değiştiren aracı yoktur. Sepete ekleme müşterinin görünür seçimiyle mevcut `/api/cart` üzerinden yapılır; ödeme ve siparişi tamamlama ilgili ekranlardadır.

Sohbet belleği tarayıcı bileşeninde tutulur; sohbet metni yerel depolamaya kaydedilmez. OpenAI isteğinde `store: false` kullanılır; bu seçenek sağlayıcının tüm saklama politikalarının kapandığı anlamına gelmez. Yanıt için gereken sınırlı katalog ve sipariş bağlamı sağlayıcıya gönderilebilir. Ses üretiminde okunacak metin gönderilir. Tarayıcı dikte servisi, tarayıcı sağlayıcısına göre ayrıca ses işleyebilir. Özel bilgi veya ödeme bilgileri sohbet alanına istenmez.

İstek boyutu, konuşma uzunluğu, yanıt süresi ve istek sıklığı sınırlıdır. Adres başına dakikada 24 sohbet / 12 ses isteğine ek olarak, dağıtım başına dakikada 120 sohbet / 40 ses isteği tavanı vardır. Birlikte gelen nginx yapılandırması istemci tarafından gönderilen `CF-Connecting-IP` başlığını temizler. Üretimde dosya tabanlı mevcut hız sınırlama deposu tüm uygulama örnekleri arasında paylaşılamıyorsa merkezi hız sınırlama gerekir; OpenAI proje bütçe limitleri ayrıca ayarlanmalıdır.

## Doğrulama — 19 Eylül 2026

- Web uygulamasındaki 37 test dosyası ve **257 test** geçti; 35 test EnexAI kapsamındadır.
- TypeScript kontrolü ve optimize üretim derlemesi geçti.
- Tarayıcıda masaüstü ve 390 × 844 mobil görünüm, sohbet, kargo yanıtı, giriş gerektiren sipariş ekranı, Escape/fokus dönüşü, konu filtreleri, başlangıç kartları ve arama kutusundan asistana geçiş kontrol edildi. Yatay taşma ve tarayıcı konsol hatası görülmedi.
- OpenAI araç çağrısı, yapılandırılmış yanıt, bilinmeyen ürün/link süzme, bağlantı hatasında katalog moduna geçiş, ses yanıtı ve müşteri izolasyonu sahte servis yanıtlarıyla test edildi. Bu ortamda anahtar bulunmadığı için gerçek OpenAI sohbeti ve ses üretimi canlı denenmedi.
- Bu çalışma kopyasındaki 2.186 katalog kaydı taslak ve görünmezdir. Asistan bu kayıtları müşteriye açmaz. Yayındaki ürünlerle ve mevcut müşteri hesabıyla üretim ortamı kabul kontrolü yapılmalıdır; bu çalışma katalog kayıtlarını yayınlamadı.

## Resmî kaynaklar

- [OpenAI Responses ve function calling](https://developers.openai.com/api/docs/guides/function-calling)
- [OpenAI ses üretimi](https://developers.openai.com/api/docs/guides/text-to-speech)

Maskot dosyaları ve üretim ayrıntıları `enexai-mascot.md` içinde belgelenir.
