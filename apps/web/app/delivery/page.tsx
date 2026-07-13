import { InformationPage } from "../../components/InformationPage";

export default function DeliveryPage() {
  return (
    <InformationPage
      eyebrow="Kargo ve teslimat"
      title="Sipariş durumunu baştan sona izleyin"
      description="Siparişler finans onayı, stok ayırma, hazırlık ve sevkiyat adımlarından geçer. Takip kodunuzla güncel operasyon durumunu görüntüleyebilirsiniz."
      actions={[
        { label: "Siparişimi takip et", href: "/orders", primary: true },
        { label: "Destek ekibine ulaş", href: "/contact" }
      ]}
      sections={[
        {
          title: "Hazırlık süreci",
          description: "Onaylanan sipariş için stok ayrılır, depo hazırlığı başlatılır ve sevkiyat planı oluşturulur."
        },
        {
          title: "Kısmi sevkiyat",
          description: "Çok kalemli siparişlerde stok durumuna göre kısmi teslimat planı satış ekibiyle netleştirilebilir."
        },
        {
          title: "Teslimat bilgileri",
          description: "Adres, yetkili kişi ve telefon bilgilerinin sipariş öncesinde güncel olması gerekir."
        },
        {
          title: "Hasar ve eksik ürün",
          description: "Teslimat sırasında koli ve ürünleri kontrol edin; hasar veya eksikliği sipariş numarasıyla destek ekibine bildirin."
        }
      ]}
      notice="Kargo firması, ücret ve tahmini teslim süresi ürün hacmi, depo ve teslimat adresine göre sipariş onayında kesinleşir."
    />
  );
}
