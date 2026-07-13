# Live Readiness

## Karar

Uygulama yerel pilot ve musteri demosu icin hazir. Gercek siparis ve musteri verisiyle production kullanimi icin asagidaki P0 maddeleri tamamlanmadan canliya alinmamali.

## P0 - Canli Oncesi

1. **PostgreSQL / Prisma gecisi**
   Teklif, siparis, sepet, musteri, bildirim, analitik, ayar ve import job JSON depolari transaction destekli PostgreSQL repository katmanina tasinmali. Mevcut Prisma semasi iyi bir baslangic, fakat web uygulamasi henuz kullanmiyor.

2. **Gercek kimlik ve yetki sistemi**
   Bayi sifreleri Argon2id veya scrypt ile hashlenmeli; imzali oturum, tek kullanimlik sifre sifirlama, giris deneme limiti, cihaz/oturum iptali ve admin rollerinin yetki matrisi eklenmeli. Test hesaplari production verisinden ayrilmali.

3. **Kalici medya depolama**
   Logo, video, PDF ve urun gorselleri Cloudflare R2'ye alinmali. Vercel veya benzeri serverless dosya sistemi kalici olmadigi icin local `public/uploads` ve JSON yazimi production depolama olarak kullanilamaz.

4. **Arka plan isleri ve XML cron**
   Redis/BullMQ worker gercek import, bildirim ve terk edilmis sepet islerini calistirmali. XML cekimi zamanlanmali; kilit, idempotency, tekrar deneme, son basarili surum, rollback ve hata alarmi eklenmeli.

5. **Gercek bildirim kanali**
   Resend/SMTP ile e-posta; daha sonra WhatsApp Business saglayicisi baglanmali. Teklif alindi, teklif fiyatlandi, siparis durumu degisti ve import hata verdi tetikleri gercek mesaj uretmeli.

6. **Production operasyonu**
   Staging ve production ayrimi, domain/DNS/SSL, Sentry, merkezi log, uptime kontrolu, gunluk veritabani yedegi, geri yukleme testi, WAF ve gizli anahtar rotasyonu tamamlanmali.

## P1 - Ilk Surumden Sonra

- OpenAI/Gemini tabanli PDF tablo okuma, urun alan esleme ve kalite puanlama.
- PDF'den cikan gorselleri crop edip R2'ye yazma; duplicate gorsel kontrolu.
- Meilisearch/Typesense ile yazim toleransli, marka-kategori-SKU aramasi.
- Firma icinde birden cok kullanici, satin alma onay limiti ve yonetici onayi.
- Kayitli siparis listeleri, tekrar siparis, favoriler, urun karsilastirma ve stok gelince haber ver.
- Cari hesap ozeti, ekstre, fatura/irsaliye indirme ve odeme altyapisi.
- Tedarikci portali, fiyat/stok dosyasi yukleme ve veri kalite skoru.
- ERP, muhasebe ve kargo adaptorleri.

## Katalog Kalitesi (guncelleme: 2026-07-13, PDF katalog aktarimi sonrasi)

- Toplam urun: 7.721 (2.960 XML + 4.761 PDF katalog; tamami kaynak PDF dogrulamasindan gecti)
- Fiyatsiz urun: 799 (cogu mesru: kurdan fiyatlanan borular, bayi fiyatli kapi panelleri - teklif modunda)
- Gorselsiz urun: 247 (tamami eski XML kaynakli; PDF urunlerinin %100'u gorselli)
- Para birimi dagilimi: 4.788 TRY / 2.834 USD / 99 EUR - karma kur gosterim karari gerekiyor
- Lokal gorsele bagimli urun: 4.761 (apps/web/public/uploads, 114MB, git DISI - deploy oncesi tasinmali)

## Go-Live Denetimi (2026-07-13)

Dogrulama kapilari: typecheck YESIL, 39/39 test YESIL, production build YESIL,
ticari akis smoke testi (teklif->fiyatlama->siparis->sepet checkout) production build uzerinde YESIL.

Canli domainde patlayacak somut maddeler:
1. Urun gorselleri (114MB, 3.349 webp) .gitignore'da - Vercel/CI deploy'una gitmez, 4.761 urun kirik gorselle acilir.
2. Tum runtime yazmalar (sepet, siparis, teklif, musteri, analitik, audit) data/*.json'a gider - Vercel'de dosya sistemi salt okunur/ucucu, checkout CANLIDA CALISMAZ. Tek sunuculu VPS'te calisir.
3. Bayi sifreleri duz metin saklaniyor ve data/customer-accounts.json git'e commitli (3 test hesabi) - hash + repodan cikarma sart.
4. Admin oturumu statik cerez degeri (ADMIN_SESSION_SECRET) - suresiz, iptal edilemez; canli oncesi guclu secret + imzali/sureli oturum onerilir.
5. robots.txt, sitemap, ozel 404/500 sayfasi yok.
6. XML fiyat guncellemesi icin zamanlanmis is yok (manuel tetikleme).
7. Siparis/teklif bildirimleri e-posta uretmiyor (sadece panel ici).

Fiyatsiz urunler teklif modunda kalabilir. Gorselsiz urunler icin yayindan once marka bazli tamamlama ve R2 gorsel aktarimi yapilmasi onerilir. Stok yok oraninin kaynak verisiyle dogrulanmasi ve kategori bazli pasiflestirme kurali belirlenmesi gerekir.

## Onerilen Servis Seti

- Veritabani: Neon PostgreSQL veya Supabase PostgreSQL
- Medya: Cloudflare R2; ihtiyac olursa Cloudflare Images
- E-posta: Resend
- Kuyruk/Redis: Upstash Redis veya yonetilen Redis
- Hata izleme: Sentry
- Hosting: Vercel veya Node destekli yonetilen platform
- DNS/WAF: Cloudflare
