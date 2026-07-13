# AI Catalog Import

## Çalışan akış

Admin ekranı: `/admin/ai-import`

1. PDF imzası, boyutu ve sayfa sınırı doğrulanır.
2. Kaynak PDF özel çalışma alanına alınır.
3. Poppler ile her sayfanın yüksek çözünürlüklü JPEG görüntüsü ve düzeni korunmuş metin katmanı çıkarılır.
4. `pdfplumber` ile gömülü resim kutuları ve kelime koordinatları okunur.
5. OpenAI Responses API yapılandırılmış JSON şemasıyla ürün/model varyantlarını çıkarır. `auto` modunda hata olursa Gemini denenir.
6. Ürün fotoğrafı gömülü resim kutusundan, koordinat ızgaralı görselden veya düzenli katalog ızgarasından belirlenir.
7. Görsel Sharp ile kırpılır, boş/tek renk sonuçlar kalite kontrolünden elenir ve WebP olarak kaydedilir.
8. Ürünler admin incelemesine gelir; alanlar düzenlenebilir, yanlış kayıt/görsel dışarıda bırakılabilir.
9. Admin onayından geçen ürünler mevcut katalog deposuna `DRAFT` olarak aktarılır. Public katalogda otomatik yayın yapılmaz.

## Uzun kataloglar

PDF bir kerede tamamlanmaya çalışılmaz. İstemci `/api/admin/import/process` üzerinden sayfaları küçük partiler halinde işler. İşlem durdurulabilir ve aynı job kaldığı sayfadan devam eder.

## Korunan alanlar

- SKU, model, barkod ve üretici kodu
- Ürün adı, marka, kategori, açıklama ve teknik özellikler
- Liste fiyatı, para birimi, KDV ve birim
- Gerçek stok adedi ile koli/paket bilgisinin ayrımı
- Minimum sipariş, paket, koli, palet ve garanti
- Kaynak PDF sayfası, güven puanı, uyarılar ve ürün görseli

Katalogda stok yoksa sistem `0 stok` iddiasında bulunmaz; `stockQuantityKnown=false` ile stok teyidi gerekli olarak saklar.

## Çalışma gereksinimleri

- Node.js ve `sharp`
- Poppler: `pdfinfo`, `pdftoppm`, `pdftotext`
- Python 3 ve `pdfplumber`
- `OPENAI_API_KEY` veya `GEMINI_API_KEY`

Binary yolları otomatik aranır; container ortamında `.env.example` içindeki yol değişkenleri açıkça tanımlanabilir.

## Production notu

Şu an job, kaynak PDF ve görseller yerel disk/JSON deposunda tutulur. Tek sunuculu kurulumda çalışır. Çok instance veya serverless production öncesinde job kayıtları PostgreSQL'e, PDF/görseller Cloudflare R2 ya da S3 uyumlu kalıcı depoya taşınmalıdır.
