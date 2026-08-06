import type { Metadata } from "next";
import "./globals.css";
import { Suspense } from "react";
import SiteHeader from "@/components/SiteHeader";
import Footer from "@/components/Footer";
import Analytics from "@/components/Analytics";
import CompareProvider from "@/components/CompareProvider";
import CompareBar from "@/components/CompareBar";
import MessengerButton from "@/components/MessengerButton";

export const metadata: Metadata = {
  title: {
    default: "დიდი ფასდაკლება თელავში!",
    template: "%s — დიდი ფასდაკლება თელავში",
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
        {/* Above the router, so a comparison selection survives navigation
            between the catalog and a product page. */}
        <CompareProvider>
          <SiteHeader />
          <main className="flex-1">{children}</main>
          <Footer />
          <CompareBar />
          {/* Inside the provider so it can sit above the comparison bar. */}
          <MessengerButton />
        </CompareProvider>
        {/* usePathname() inside makes this a client boundary; the Suspense
            keeps it from opting the whole layout out of static rendering. */}
        <Suspense fallback={null}>
          <Analytics />
        </Suspense>
      </body>
    </html>
  );
}
