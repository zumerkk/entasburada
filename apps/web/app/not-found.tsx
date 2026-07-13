import { InformationPage } from "../components/InformationPage";

export default function NotFoundPage() {
  return (
    <InformationPage
      eyebrow="Sayfa bulunamadı"
      title="Aradığınız sayfa taşınmış veya kaldırılmış olabilir"
      description="Adres yanlış yazılmış olabilir ya da ürün yayından kaldırılmış olabilir. Katalogdan aramaya devam edebilir veya destek ekibimize ulaşabilirsiniz."
      actions={[
        { label: "Ana kataloğa git", href: "/catalog", primary: true },
        { label: "Ana sayfaya dön", href: "/" }
      ]}
      sections={[
        {
          title: "Ürün mü arıyordunuz?",
          description: "Katalog aramasında SKU, barkod, marka veya teknik özellik ile arama yapabilirsiniz."
        },
        {
          title: "Destek",
          description: "Aradığınızı bulamadıysanız destek@entasburada.com adresine yazın; ekibimiz doğru ürüne yönlendirsin."
        }
      ]}
    />
  );
}
