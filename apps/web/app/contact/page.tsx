import { InformationPage } from "../../components/InformationPage";

export default function ContactPage() {
  return (
    <InformationPage
      eyebrow="İletişim"
      title="Satış ve teknik destek ekibine ulaşın"
      description="Ürün alternatifi, toplu alım, teklif, bayi hesabı ve sipariş operasyonları için ilgili ekibe doğrudan ulaşabilirsiniz."
      actions={[
        { label: "0212 000 00 00", href: "tel:+902120000000", primary: true },
        { label: "E-posta gönder", href: "mailto:destek@entasburada.com" }
      ]}
      sections={[
        {
          title: "Satış ve teklif",
          description: "Proje listeleri, toplu satın alma ve müşteriye özel fiyat talepleri için teklif akışını kullanın.",
          bullets: ["destek@entasburada.com", "Pazartesi-Cuma 09.00-18.00", "Teklif taleplerinde ürün kodu ve adet bilgisi"]
        },
        {
          title: "Bayi operasyonu",
          description: "Hesap onayı, fiyat grubu, teslimat adresi ve kullanıcı erişimi konularında bayi bilgilerinizi iletin.",
          bullets: ["Firma unvanı ve vergi numarası", "Yetkili kişi ve telefon", "Bayi kodu varsa başvuruya ekleyin"]
        },
        {
          title: "Sipariş desteği",
          description: "Mevcut siparişler için takip kodunuzu kullanın; sevkiyat veya ürün değişikliği gerekiyorsa sipariş numarasını paylaşın."
        },
        {
          title: "Teknik ürün desteği",
          description: "Uyumluluk, ölçü, alternatif ürün ve teknik doküman taleplerinde ürün SKU veya barkodunu belirtin."
        }
      ]}
      notice="Canlıya geçmeden önce telefon, e-posta ve çalışma saatleri işletmenin kesin iletişim bilgileriyle doğrulanmalıdır."
    />
  );
}
