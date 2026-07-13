import { InformationPage } from "../../components/InformationPage";

export default function KvkkPage() {
  return (
    <InformationPage
      eyebrow="KVKK"
      title="Kişisel verilerin işlenmesine ilişkin bilgilendirme"
      description="ENTAŞBURADA; bayi başvurusu, hesap yönetimi, teklif, sipariş, teslimat ve destek süreçlerinde gerekli kişisel verileri amaçla sınırlı olarak işler."
      actions={[{ label: "KVKK talepleri için iletişim", href: "mailto:destek@entasburada.com", primary: true }]}
      sections={[
        {
          title: "İşlenen veri grupları",
          description: "Kimlik ve iletişim bilgileri, firma ve vergi bilgileri, hesap hareketleri, teklif-sipariş kayıtları, teslimat bilgileri ve güvenlik kayıtları işlenebilir."
        },
        {
          title: "İşleme amaçları",
          description: "Bayi ilişkisinin kurulması, sipariş ve tekliflerin yürütülmesi, teslimat, destek, güvenlik, muhasebe ve yasal yükümlülüklerin yerine getirilmesi amaçlanır."
        },
        {
          title: "Aktarım ve saklama",
          description: "Veriler yalnızca hizmetin gerektirdiği ölçüde yetkili çalışanlar, altyapı sağlayıcıları, lojistik ve yasal olarak yetkili kurumlarla paylaşılabilir. Saklama süreleri yasal ve operasyonel gerekliliklere göre belirlenir."
        },
        {
          title: "İlgili kişi hakları",
          description: "KVKK kapsamındaki bilgi alma, düzeltme, silme, işleme itiraz ve zarar giderimi talepleri kimlik doğrulamasıyla veri sorumlusuna iletilebilir."
        }
      ]}
      notice="Bu metin operasyonel taslaktır. Veri sorumlusu unvanı, açık adresi, saklama süreleri, aktarım tarafları ve başvuru yöntemi canlı yayın öncesinde hukuk danışmanı tarafından kesinleştirilmelidir."
    />
  );
}
