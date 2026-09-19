import type { Metadata } from "next";
import { EnexExperience } from "../../components/enexai/EnexExperience";

export const metadata: Metadata = {
  title: "EnexAI | Entaş'ın akıllı alışveriş asistanı",
  description: "Ürünleri keşfet, alternatifleri incele ve önceki siparişlerinden seçerek sepetini oluştur. Entaş'ın alışveriş asistanı EnexAI her sayfada yanında."
};

export default function EnexAIPage() {
  return <EnexExperience />;
}
