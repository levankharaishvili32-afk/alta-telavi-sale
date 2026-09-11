import type { Metadata } from "next";
import "./globals.css";
import { Suspense } from "react";
import { Analytics as VercelAnalytics } from "@vercel/analytics/next";
import SiteHeader from "@/components/SiteHeader";
import Footer from "@/components/Footer";
import Analytics from "@/components/Analytics";
import CompareProvider from "@/components/CompareProvider";
import CompareBar from "@/components/CompareBar";
import MessengerButton from "@/components/MessengerButton";

export const metadata: Metadata = {
  title: {
    default: "დიდი cashback აქცია გლდანში!",
    template: "%s — cashback აქცია გლდანში",
  },
  description:
    "ალტას cashback აქცია გლდანის ფილიალში — 12–13 სექტემბერს. სამზარეულოს, სახლისა და პერსონალური მოვლის ტექნიკა, ოფიციალური გარანტიით.",
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

        {/*
          Vercel Web Analytics. Needs no key — it identifies the project from
          the deployment it is served by, which is also why it does nothing
          anywhere else: the script lives at /_vercel/insights/script.js, a path
          only Vercel serves. Locally it 404s, and that is expected.

          Deliberately alongside our own tag rather than instead of it. This one
          counts every route change, including the `history.replaceState` the
          catalog does on each filter change, so its "page views" run high; ours
          fires once per pathname. Read Vercel's numbers as traffic, GA4's as
          pages actually visited.
        */}
        <VercelAnalytics />
      </body>
    </html>
  );
}
