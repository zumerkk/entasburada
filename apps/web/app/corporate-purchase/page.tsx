import { InformationPage } from "../../components/InformationPage";

export default function CorporatePurchasePage() {
  return (
    <InformationPage
      eyebrow="Kurumsal satın alma"
      title="Proje listelerini teklif ve siparişe dönüştürün"
      description="Çok satırlı ürün listeleri, dönemsel satın almalar ve şantiye teslimatları için kontrollü teklif, onay ve sevkiyat akışı sunuyoruz."
      actions={[
        { label: "Toplu teklif oluştur", href: "/quote", primary: true },
        { label: "Kurumsal hesap başvurusu", href: "/dealer-application" }
      ]}
      sections={[
        {
          title: "Toplu ürün girişi",
          description: "SKU, barkod veya CSV/TSV dosyasıyla yüzlerce kalemi aynı talepte toplayın.",
          bullets: ["Satır bazlı adet ve birim", "Hedef fiyat notu", "Proje kodu ve teslimat şehri"]
        },
        {
          title: "Müşteriye özel fiyat",
          description: "Bayi segmenti, marka, kategori, miktar ve proje koşullarına göre fiyat kuralları uygulanır."
        },
        {
          title: "Onay ve takip",
          description: "Teklif fiyatlandığında takip kodu üzerinden görünür; onaylanan çalışma sipariş operasyonuna aktarılır."
        },
        {
          title: "Çoklu teslimat",
          description: "Şantiye, depo veya şube bazlı teslimat ihtiyaçları teklif notlarıyla satış ekibine iletilebilir."
        }
      ]}
    />
  );
}
