import { InformationPage } from "../../components/InformationPage";

export default function AboutPage() {
  return (
    <InformationPage
      eyebrow="ENTAŞBURADA"
      title="Profesyonel tedariki tek merkezde topluyoruz"
      description="Hırdavat, yapı market ve endüstriyel ekipman satın alma süreçlerini katalog, bayi fiyatlandırması, teklif ve sipariş operasyonuyla aynı sistemde buluşturuyoruz."
      actions={[
        { label: "Ana kataloğu aç", href: "/catalog", primary: true },
        { label: "Bayi başvurusu", href: "/dealer-application" }
      ]}
      sections={[
        {
          title: "Kime hizmet veriyoruz?",
          description: "Bayiler, yapı marketler, nalburlar, sanayi işletmeleri ve kurumsal satın alma ekipleri için tasarlanmış bir B2B çalışma alanıyız.",
          bullets: ["Onaylı bayi fiyatları", "SKU ve Excel ile hızlı sipariş", "Proje ve toplu alım teklifleri"]
        },
        {
          title: "Nasıl çalışıyoruz?",
          description: "Tedarikçi katalogları doğrulama ve yayın akışından geçer. Fiyat ve stok görünürlüğü müşteri yetkisine göre kontrollü biçimde açılır.",
          bullets: ["Kaynak bazlı XML izleme", "Müşteriye özel fiyat kuralları", "Tekliften siparişe izlenebilir operasyon"]
        },
        {
          title: "Operasyon yaklaşımımız",
          description: "Satın alma ekiplerinin tekrar eden işleri daha hızlı tamamlamasını, satış ekibinin ise talepleri tek ekrandan yönetmesini hedefliyoruz."
        },
        {
          title: "Tedarikçi iş birlikleri",
          description: "Yeni marka ve ürün kaynakları kontrollü önizleme, veri kalite kontrolü ve admin onayıyla kataloğa eklenir."
        }
      ]}
    />
  );
}
