import { InformationPage } from "../../components/InformationPage";
import { COMPANY_CONTACT } from "../../lib/company-contact";

export default function ContactPage() {
  return (
    <InformationPage
      eyebrow="İletişim"
      title="Satış ve teknik destek ekibine ulaşın"
      description="Ürün alternatifi, toplu alım, teklif, bayi hesabı ve sipariş operasyonları için ilgili ekibe doğrudan ulaşabilirsiniz."
      actions={[
        { label: COMPANY_CONTACT.technicalSupportPhone, href: COMPANY_CONTACT.technicalSupportPhoneHref, primary: true },
        { label: "E-posta gönder", href: COMPANY_CONTACT.supportEmailHref }
      ]}
      sections={[
        {
          title: "Satış ve teklif",
          description: "Proje listeleri, toplu satın alma ve müşteriye özel fiyat talepleri için teklif akışını kullanın.",
          bullets: [COMPANY_CONTACT.supportEmail, "Pazartesi-Cuma 09.00-18.00", "Teklif taleplerinde ürün kodu ve adet bilgisi"]
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
          description: "Uyumluluk, ölçü, alternatif ürün ve teknik doküman taleplerinde ürün SKU veya barkodunu belirtin.",
          bullets: [COMPANY_CONTACT.technicalSupportPhone]
        },
        {
          title: "Merkez adresi",
          description: COMPANY_CONTACT.address
        }
      ]}
    />
  );
}
