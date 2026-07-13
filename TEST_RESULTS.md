# Test Results

Tarih: 2026-07-10

## Otomatik Kontroller

- `pnpm test`: gecti. Web uygulamasinda 4 dosya / 11 test; katalog, fiyat ve import paketleriyle toplam 27 test gecti.
- `pnpm typecheck`: 13 workspace paketi gecti.
- `pnpm build`: 13 workspace paketi uyarısız production build tamamladi.
- `pnpm db:validate`: Prisma semasi gecerli.
- `pnpm audit --prod`: bilinen guvenlik acigi bulunmadi.

## Ticari Smoke Test

- Public teklif olusturma.
- Admin teklif listesi ve fiyatlandirma.
- Tekliften siparise donusum.
- Finans, stok, depo ve sevkiyat durumu guncelleme.
- Public takip koduyla siparis durumu goruntuleme.
- Yetkisiz admin ve sepet API isteklerinde `401`.
- Bayi sepetinde ozel fiyat motoru.
- Sepetten siparis ve sepetin temizlenmesi.
- Test sonunda teklif, siparis, sepet ve bildirim dosyalarinin geri alinmasi.

Komut: `pnpm smoke:commercial`

## Import Smoke Test

- Yetkisiz import API isteginde `401`.
- Yerel/ozel ag XML URL isteginde engelleme.
- XML parse, preview, export ve admin onayi.
- Onaylanan urunun katalogda taslak kayda donusmesi.
- PDF job olusturma ve `needs_review` durumu.
- Test sonunda import job, katalog ve audit dosyalarinin geri alinmasi.

Komut: `pnpm smoke:import`

## Tarayici Testleri

- Admin girisi ve tum ana admin ekranlari acildi.
- Bronz, Gumus ve Platin test bayi hesaplari ayri limit ve iskonto kurallariyla acildi.
- Hizli siparis ekranindan urun sepete eklendi ve fiyat motoru uygulandi.
- Proje hesabinda ozel net fiyat ve marka iskontosu goruldu.
- Ana sayfa, admin ve yeni bilgi sayfalari responsive olarak kontrol edildi.
- Mobil gorunumde yatay sayfa tasmasi bulunmadi.
- Tarayici konsolunda hata veya uyari bulunmadi.
- Gorunur statik site linklerinde `404` bulunmadi.

## Canli XML ve Katalog

- EuroMix URL: `200`, yaklasik 2.16 MB XML.
- Mirsan: 343 / 343 satir, 0 hata.
- EuroMix: 2.617 / 2.617 satir, 0 hata.
- Toplam: 2.960 aktif urun, 0 taslak.
- Mükerrer SKU: 0; mukerrer barkod: 0.
- Son import: 2026-07-10.

## Local Server

- URL: `http://localhost:3000`
- Admin: `http://localhost:3000/admin/login`
- Screen session: `entasburada-web`
