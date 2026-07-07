import type { Metadata } from "next";
import { Header } from "../components/Header";
import { Footer } from "../components/Footer";
import "./globals.css";

export const metadata: Metadata = {
  title: "ENTAŞBURADA | Profesyonellerin Toptan Hırdavat Platformu",
  description: "Hırdavat, yapı market, endüstriyel ekipman ve teknik sarf ürünleri için B2B bayi ticaret platformu.",
  metadataBase: new URL("https://entasburada.com"),
  openGraph: {
    title: "ENTAŞBURADA",
    description: "Bayi onaylı fiyatlandırma ve profesyonel ürün kataloğu.",
    siteName: "ENTAŞBURADA",
    type: "website"
  }
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="tr">
      <body>
        <Header />
        {children}
        <Footer />
      </body>
    </html>
  );
}
