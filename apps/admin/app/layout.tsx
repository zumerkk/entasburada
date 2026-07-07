import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ENTAŞBURADA Admin",
  description: "B2B hırdavat ve yapı market operasyon paneli"
};

export default function AdminLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="tr">
      <body>{children}</body>
    </html>
  );
}
