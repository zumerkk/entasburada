import { InformationPage } from "../../components/InformationPage";

export default function PasswordResetPage() {
  return (
    <InformationPage
      eyebrow="Hesap desteği"
      title="Bayi hesabınız için şifre yenileme talebi oluşturun"
      description="Hesap güvenliği nedeniyle şifre değişikliği firma ve yetkili kişi doğrulamasından sonra destek ekibi tarafından başlatılır."
      actions={[
        { label: "Şifre desteği iste", href: "mailto:destek@entasburada.com?subject=Bayi%20hesabi%20sifre%20yenileme", primary: true },
        { label: "Giriş ekranına dön", href: "/login" }
      ]}
      sections={[
        {
          title: "Talebe eklenecek bilgiler",
          description: "Firma unvanı, bayi e-posta adresi, yetkili kişi adı, telefon ve varsa bayi kodunu iletin."
        },
        {
          title: "Güvenlik kontrolü",
          description: "Destek ekibi kayıtlı iletişim kanalından doğrulama yapar; mevcut şifre e-posta veya telefon üzerinden istenmez."
        },
        {
          title: "Hesap erişimi",
          description: "Şüpheli erişim durumunda hesabın geçici olarak askıya alınmasını destek ekibinden talep edebilirsiniz."
        },
        {
          title: "Yeni kullanıcı",
          description: "Firmanızda yeni bir satın alma kullanıcısı açılması gerekiyorsa bayi yöneticisi bilgisiyle ayrı erişim talebi oluşturun."
        }
      ]}
      notice="Otomatik, tek kullanımlık bağlantıyla şifre sıfırlama akışı e-posta servisi ve kalıcı kullanıcı veritabanı devreye alındığında etkinleştirilecektir."
    />
  );
}
