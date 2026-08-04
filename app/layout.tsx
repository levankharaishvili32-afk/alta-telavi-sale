import type { Metadata } from "next";
import "./globals.css";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";

export const metadata: Metadata = {
  title: {
    default: "თელავის დიდი ფასდაკლება",
    template: "%s — თელავის დიდი ფასდაკლება",
  },
  description:
    "სამზარეულოს, სახლისა და პერსონალური მოვლის ტექნიკის დიდი ფასდაკლება ალტაში. ფასები ლარში, ოფიციალური გარანტიით.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ka" className="h-full">
      <body className="flex min-h-full flex-col antialiased">
        <SiteHeader />
        <main className="flex-1">{children}</main>
        <SiteFooter />
      </body>
    </html>
  );
}
