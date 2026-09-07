import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Meitainc Transaction Mock",
  description: "Mock API dinamis berbasis rule untuk layanan transaksi Payterra",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id">
      <body>{children}</body>
    </html>
  );
}
