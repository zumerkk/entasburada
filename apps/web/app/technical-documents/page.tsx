import { InformationPage } from "../../components/InformationPage";

export default function TechnicalDocumentsPage() {
  return (
    <InformationPage
      eyebrow="Teknik dokümanlar"
      title="Doğru ürünü teknik verisiyle seçin"
      description="Ürün ölçüsü, kullanım alanı, garanti, montaj ve uyumluluk bilgileri katalog kaynağı doğrulandıkça ürün detayına bağlanır."
      actions={[
        { label: "Ürün kataloğunda ara", href: "/catalog", primary: true },
        { label: "Doküman talep et", href: "/contact" }
      ]}
      sections={[
        {
          title: "Desteklenen dokümanlar",
          description: "Teknik föy, kullanım kılavuzu, montaj dokümanı, sertifika, garanti belgesi ve ölçü çizimleri ürün kaydına eklenebilir."
        },
        {
          title: "Doküman doğrulama",
          description: "Tedarikçiden gelen dosyalar doğru SKU ve ürün varyantıyla eşleştirildikten sonra yayımlanır."
        },
        {
          title: "Doküman talebi",
          description: "Aradığınız dosya görünmüyorsa ürün SKU, marka ve doküman türünü destek ekibine iletin."
        },
        {
          title: "Proje kullanımı",
          description: "Çoklu ürün teknik föyleri proje koduyla birlikte talep edilerek satın alma dosyasına hazırlanabilir."
        }
      ]}
      notice="Katalogda henüz dosyası bulunmayan ürünler için doküman tedarikçiden doğrulanarak sağlanır."
    />
  );
}
