"use client";

import { useState } from "react";
import { ArrowRight, ArrowUpRight, AudioLines, Check, ChevronRight, History, MessageCircle, PackageSearch, Search, ShieldCheck, ShoppingBag, Sparkles, Truck, Wrench } from "lucide-react";
import styles from "./EnexExperience.module.css";

const groups = ["Hepsi", "Ürün keşfi", "Sepet & sipariş", "Hesabım & destek"] as const;
const capabilities = [
  { group: 1, title: "Aradığını tarif et", description: "Ürün adını bilmesen de ihtiyacını anlatarak başla.", prompt: "Banyo tadilatı için batarya arıyorum. Hangi ürünleri inceleyebilirim?", icon: Search },
  { group: 1, title: "Ürün koduyla bul", description: "Elindeki SKU veya model koduyla kataloğu tara.", prompt: "Ürün koduyla arama yapmak istiyorum. Nasıl ilerleyebilirim?", icon: PackageSearch },
  { group: 1, title: "Alternatifleri keşfet", description: "Bulamadığın ürün için benzer seçenekleri incele.", prompt: "Stokta olmayan bir ürüne alternatif bulmama yardım et.", icon: Sparkles },
  { group: 1, title: "Yan yana düşün", description: "Seçeneklerin katalogdaki özelliklerini karşılaştır.", prompt: "İki ürünü karşılaştırmak istiyorum. Hangi özellikleri kontrol etmeliyim?", icon: Wrench },
  { group: 1, title: "Bütçeni anlat", description: "İhtiyacın ve bütçenle ürün araştırmasını daralt.", prompt: "Bütçeme uygun ürün seçmek istiyorum. Bana yardımcı olur musun?", icon: ShoppingBag },
  { group: 1, title: "Markaları keşfet", description: "Aradığın markanın ürünlerine birlikte bakalım.", prompt: "Euromix markasının ürünlerini göster.", icon: PackageSearch },
  { group: 1, title: "Stok durumunu öğren", description: "Ürünün güncel katalog durumunu kontrol et.", prompt: "Aradığım ürünün stok durumunu nasıl öğrenebilirim?", icon: Check },
  { group: 1, title: "Projene hazırlan", description: "İşini anlat, malzeme ihtiyacını birlikte netleştirelim.", prompt: "Bahçe sulama projem var. Malzeme seçimine nereden başlamalıyım?", icon: Wrench },
  { group: 2, title: "Sepetini tamamla", description: "Sepetindeki ürünlere eşlik edebilecek seçeneklere bak.", prompt: "Sepetimdeki ürünleri tamamlayabilecek ürünleri göster.", icon: ShoppingBag },
  { group: 2, title: "Tekrar sipariş ver", description: "Önceki siparişinden seçtiğin satırları sepete ekle.", prompt: "Önceki siparişlerimden ürün seçerek yeniden sepete eklemek istiyorum.", icon: History },
  { group: 2, title: "Kargo eşiğini gör", description: "Ücretsiz kargoya kalan tutarı sepetinle kontrol et.", prompt: "Sepetim ücretsiz kargo için yeterli mi?", icon: Truck },
  { group: 2, title: "Siparişini takip et", description: "Hesabındaki sipariş durumlarına kolayca ulaş.", prompt: "Son siparişlerimin durumu nedir?", icon: Truck },
  { group: 2, title: "Miktarı sen seç", description: "Tekrar siparişte adetleri ihtiyacına göre düzenle.", prompt: "Önceki siparişimdeki ürünlerden farklı miktarlarda almak istiyorum.", icon: ShoppingBag },
  { group: 2, title: "Teklif listesi oluştur", description: "Toplu alım için teklif ekranına hızla ulaş.", prompt: "Toplu ürün alımı için nasıl teklif isteyebilirim?", icon: MessageCircle },
  { group: 2, title: "Hızlı siparişe geç", description: "Uzun malzeme listelerin için doğru ekrana git.", prompt: "Elimde uzun bir malzeme listesi var. Hızlı sipariş ekranına nasıl ulaşırım?", icon: ArrowRight },
  { group: 2, title: "Sipariş şablonlarını kullan", description: "Düzenli alımlarını yöneteceğin sayfaya ulaş.", prompt: "Sık aldığım ürünler için sipariş şablonu oluşturmak istiyorum.", icon: History },
  { group: 3, title: "Bayi hesabını aç", description: "Başvuru ve giriş adımlarında yolunu bul.", prompt: "Bayi başvurusu nasıl yapılır?", icon: ShieldCheck },
  { group: 3, title: "Sana ait fiyatları gör", description: "Giriş yaptığında hesabına uygulanan fiyatları incele.", prompt: "Bayi fiyatlarını nasıl görebilirim?", icon: ShoppingBag },
  { group: 3, title: "Teslimatı öğren", description: "Kargo ve teslimat bilgilendirmesine ulaş.", prompt: "Kargo ve teslimat hakkında bilgi almak istiyorum.", icon: Truck },
  { group: 3, title: "Teknik dokümanlara ulaş", description: "Ürün incelemeni teknik belgelerle sürdür.", prompt: "Ürünlerin teknik dokümanlarını nerede bulabilirim?", icon: Wrench },
  { group: 3, title: "Ekibini yönet", description: "Firma kullanıcıları ve onay ekranlarına yönlen.", prompt: "Firma hesabıma ekip arkadaşımı nasıl ekleyebilirim?", icon: ShieldCheck },
  { group: 3, title: "Destek ekibine ulaş", description: "İhtiyaç duyduğunda Entaş ekibiyle iletişime geç.", prompt: "Entaş teknik destek ekibine ulaşmak istiyorum.", icon: MessageCircle },
  { group: 3, title: "Sesli devam et", description: "Destekleyen tarayıcıda konuş; sesli yanıtı sen aç.", prompt: "Sesli görüşmeyi nasıl kullanabilirim?", icon: AudioLines },
  { group: 3, title: "Sayfada yolunu bul", description: "Hesap, proje ve sipariş ekranlarını kolayca keşfet.", prompt: "Bu sistemde kullanabileceğim özellikleri anlat.", icon: Sparkles }
];

function openAssistant(prompt?: string) {
  window.dispatchEvent(new CustomEvent("entas-enexai-open", { detail: { prompt } }));
}

export function EnexExperience() {
  const [group, setGroup] = useState(0);
  return (
    <main className={styles.page}>
      <section className={styles.hero}>
        <div className={styles.heroContent}>
          <div className={styles.eyebrow}><span /> ENTAŞ'IN YENİ TAKIM ARKADAŞI</div>
          <h1>Tanıştıralım,<br /><span>Enex<span className={styles.ai}>AI</span>.</span></h1>
          <p>Doğru üründen bir sonraki siparişine.<br />İşini bilen bir yardımcı, her zaman yanında.</p>
          <button className={styles.primary} onClick={() => openAssistant()}><Sparkles size={19} /> EnexAI ile tanış <ArrowUpRight size={20} /></button>
          <div className={styles.heroNotes}><span><Check size={15} /> Gerçek katalog</span><span><Check size={15} /> Sana ait siparişler</span><span><Check size={15} /> Kontrol sende</span></div>
        </div>
        <div className={styles.heroVisual}>
          <div className={styles.orbit} /><div className={styles.orbitSmall} />
          <div className={styles.mascot}><img src="/images/enexai/enexai-mascot-3d.png" width={209} height={372} alt="Turuncu çekiç gövdesi ve turkuaz eldivenleriyle el sallayan EnexAI" /></div>
          <div className={styles.hello}><Sparkles size={15} /><span>Merhaba, ben EnexAI!<br /><strong>Bugün neye ihtiyacın var?</strong></span></div>
          <div className={styles.floatingCard}><span className={styles.cardIcon}><PackageSearch size={22} /></span><div><small>Birlikte bulalım</small><strong>İşine uygun ürünler</strong></div><Check size={16} /></div>
          <div className={styles.signature}>BİRAZ ZEKA. BOLCA ENTAŞ.</div>
        </div>
      </section>
      <section className={styles.journey} aria-label="EnexAI ile alışveriş">
        {[{ icon: MessageCircle, number: "01", title: "İhtiyacını anlat", text: "Yaz veya mikrofonla konuş." }, { icon: PackageSearch, number: "02", title: "Birlikte keşfet", text: "Ürünleri, alternatifleri ve siparişlerini gör." }, { icon: ShoppingBag, number: "03", title: "Kararını ver", text: "İstediğin ürünleri seç, sepete ekle." }].map(({ icon: Icon, number, title, text }) => <div className={styles.step} key={number}><span className={styles.stepIcon}><Icon size={23} /></span><div><small>{number}</small><h2>{title}</h2><p>{text}</p></div><ChevronRight size={20} className={styles.stepArrow} /></div>)}
      </section>
      <section className={styles.discover}>
        <div className={styles.sectionTop}><div><span className={styles.label}>BİR SORUYLA BAŞLAR</span><h2>İşinin her adımında yanında.</h2><p>Bir konu seç. Gerisini birlikte netleştirelim.</p></div><span className={styles.count}>24 başlangıç noktası <Sparkles size={16} /></span></div>
        <div className={styles.filters} aria-label="Yardım konuları">{groups.map((name, index) => <button key={name} aria-pressed={group === index} className={group === index ? styles.activeFilter : ""} onClick={() => setGroup(index)}>{name}</button>)}</div>
        <div className={styles.grid}>{capabilities.filter((item) => !group || item.group === group).map(({ title, description, prompt, icon: Icon }) => <button className={styles.feature} key={title} onClick={() => openAssistant(prompt)}><span className={styles.featureIcon}><Icon size={21} /></span><ArrowUpRight className={styles.featureArrow} size={18} /><h3>{title}</h3><p>{description}</p><span className={styles.try}>EnexAI'ye sor <ArrowRight size={14} /></span></button>)}</div>
      </section>
      <section className={styles.trust}><ShieldCheck size={28} /><div><h2>Yardımcı EnexAI. Son söz sende.</h2><p>Sepete hangi ürünlerin ekleneceğini sen seçersin. Sipariş ve ödeme işlemlerini ilgili ekranda kendin tamamlarsın. Ses kapalı başlar; mikrofon yalnızca sen başlatınca açılır.</p><p className={styles.disclosure}>Yapay zekâ sohbeti ve yapay olarak üretilen ses OpenAI bağlantısı gerektirir. Bağlantı olmadığında katalog yardımı devam eder. Mesajlar ve yanıt için gereken sınırlı ürün, sepet ve sipariş bilgileri hizmet sağlayıcıyla işlenir. <a href="/kvkk">Veri kullanımı hakkında bilgi <ArrowUpRight size={12} /></a></p></div></section>
    </main>
  );
}
