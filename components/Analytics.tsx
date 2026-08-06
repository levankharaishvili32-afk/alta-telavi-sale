"use client";

import Script from "next/script";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

/**
 * Google Analytics 4 and the Meta pixel, each switched on by its own
 * environment variable. With neither set nothing is rendered and no
 * third-party script is fetched, so local development and preview builds stay
 * clean.
 *
 *   NEXT_PUBLIC_GA_ID=G-XXXXXXXXXX
 *   NEXT_PUBLIC_FB_PIXEL_ID=1234567890
 *
 * Both must be NEXT_PUBLIC_, because the browser is what sends the hit.
 *
 * ## Why page views are sent by hand
 *
 * This is a single-page app: moving between the catalog and a product page
 * never reloads the document, so neither vendor's "on load" hit would fire
 * again. The usual fix is to let them watch the History API instead — but the
 * catalog *also* rewrites the URL with `history.replaceState` on every filter
 * change, which is not a page view. Ticking four brand checkboxes would report
 * four visits.
 *
 * So both tags are configured not to send anything on their own, and this
 * component sends exactly one hit per pathname change. `usePathname()`
 * deliberately excludes the query string, so filtering and sorting are silent
 * while `/` → `/product/145224` is counted.
 *
 * If GA4's Enhanced Measurement has "Page changes based on browser history
 * events" enabled (it is on by default), turn it off in
 * Admin → Data Streams → your stream → Enhanced measurement. Otherwise Google
 * counts the filter rewrites on top of what this sends.
 */

const GA_ID = process.env.NEXT_PUBLIC_GA_ID;
const FB_PIXEL_ID = process.env.NEXT_PUBLIC_FB_PIXEL_ID;

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
    fbq?: ((...args: unknown[]) => void) & { callMethod?: (...a: unknown[]) => void };
  }
}

export default function Analytics() {
  if (!GA_ID && !FB_PIXEL_ID) return null;

  return (
    <>
      {GA_ID && (
        <>
          <Script
            src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`}
            strategy="afterInteractive"
          />
          <Script id="ga-init" strategy="afterInteractive">
            {`
              window.dataLayer = window.dataLayer || [];
              function gtag(){dataLayer.push(arguments);}
              window.gtag = gtag;
              gtag('js', new Date());
              gtag('config', '${GA_ID}', { send_page_view: false });
            `}
          </Script>
        </>
      )}

      {FB_PIXEL_ID && (
        <>
          <Script id="fb-pixel-init" strategy="afterInteractive">
            {`
              !function(f,b,e,v,n,t,s)
              {if(f.fbq)return;n=f.fbq=function(){n.callMethod?
              n.callMethod.apply(n,arguments):n.queue.push(arguments)};
              if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
              n.queue=[];t=b.createElement(e);t.async=!0;
              t.src=v;s=b.getElementsByTagName(e)[0];
              s.parentNode.insertBefore(t,s)}(window,document,'script',
              'https://connect.facebook.net/en_US/fbevents.js');
              fbq('init', '${FB_PIXEL_ID}');
            `}
          </Script>
          {/* Counts visitors with JavaScript disabled, and lets Meta's own
              "Test events" tool confirm the pixel is installed at all. */}
          <noscript>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              height="1"
              width="1"
              style={{ display: "none" }}
              alt=""
              src={`https://www.facebook.com/tr?id=${FB_PIXEL_ID}&ev=PageView&noscript=1`}
            />
          </noscript>
        </>
      )}

      <PageViews />
    </>
  );
}

function PageViews() {
  const pathname = usePathname();
  // The scripts above load `afterInteractive`, so the very first effect can run
  // before `gtag`/`fbq` exist. Both vendors buffer calls made before their
  // library finishes loading — gtag through `dataLayer`, fbq through its own
  // queue — but only once their stub is defined, hence the short retry.
  const sent = useRef<string | null>(null);

  useEffect(() => {
    if (sent.current === pathname) return;

    let attempts = 0;
    const send = () => {
      const ready = (!GA_ID || window.gtag) && (!FB_PIXEL_ID || window.fbq);
      if (!ready) {
        if (attempts++ > 40) return; // ~4s; the tag is blocked or failed
        timer = window.setTimeout(send, 100);
        return;
      }
      sent.current = pathname;
      if (GA_ID) {
        window.gtag?.("event", "page_view", {
          page_path: pathname,
          page_location: window.location.href,
          page_title: document.title,
        });
      }
      if (FB_PIXEL_ID) window.fbq?.("track", "PageView");
    };

    let timer = window.setTimeout(send, 0);
    return () => window.clearTimeout(timer);
  }, [pathname]);

  return null;
}
