"use client";

import { useEffect, useState } from "react";

/**
 * m.me rather than facebook.com/alta.ge: it hands off to the Messenger app
 * directly on a phone and falls back to the web client on a desktop, so the
 * conversation opens in one tap either way.
 */
const MESSENGER_URL = "https://m.me/alta.ge";
/** Used where m.me is blocked — corporate networks and some ad blockers. */
const PAGE_URL = "https://www.facebook.com/alta.ge";

const NUDGE_KEY = "alta-messenger-nudge";
const NUDGE_DELAY_MS = 3000;
const NUDGE_VISIBLE_MS = 6000;

/**
 * Floating Messenger contact button, mounted once in the root layout.
 *
 * ## Not overlapping the comparison bar
 *
 * The comparison selection bar is fixed to the bottom of the screen and its
 * height changes with the viewport — it stacks on a phone. Rather than guess
 * an offset, `CompareBar` publishes its measured height as the CSS variable
 * `--compare-bar-h`, and this button sits above whatever that says. When no
 * bar is on screen the variable is `0px` and the button returns to the corner.
 * On a phone that means the bar keeps the corner and the button moves up,
 * which is the right priority: the bar is mid-task, this is an offer.
 */
export default function MessengerButton() {
  const [nudge, setNudge] = useState(false);

  useEffect(() => {
    let dismissed = false;
    try {
      dismissed = window.localStorage.getItem(NUDGE_KEY) === "dismissed";
    } catch {
      // Unreadable storage just means the nudge shows again next visit.
    }
    if (dismissed) return;

    const show = setTimeout(() => setNudge(true), NUDGE_DELAY_MS);
    const hide = setTimeout(
      () => setNudge(false),
      NUDGE_DELAY_MS + NUDGE_VISIBLE_MS,
    );
    return () => {
      clearTimeout(show);
      clearTimeout(hide);
    };
  }, []);

  const dismissNudge = () => {
    setNudge(false);
    try {
      window.localStorage.setItem(NUDGE_KEY, "dismissed");
    } catch {
      /* best effort */
    }
  };

  const trackContact = () => {
    // Meta's standard Contact event, plus GA4 if the site has an id set.
    // Both tags are optional; neither is loaded without its env var.
    window.fbq?.("track", "Contact");
    window.gtag?.("event", "contact", {
      method: "messenger",
      link_url: MESSENGER_URL,
    });
  };

  return (
    <div
      /* 16px from both edges on mobile, 20px from `sm` up. The bottom offset
         also clears the comparison bar whenever one is on screen. */
      className="group fixed bottom-[calc(var(--compare-bar-h,0px)+16px)] right-4 z-40 flex items-center gap-2 sm:bottom-[calc(var(--compare-bar-h,0px)+20px)] sm:right-5"
    >
      {/* Delayed nudge. Separate from the link so its dismiss control is a
          real button rather than a button nested inside an anchor. */}
      {nudge && (
        <div className="alta-corners flex items-center gap-1.5 border border-alta-100 bg-white py-2 pl-3 pr-1.5 shadow-lg motion-safe:animate-[messenger-slide_220ms_ease-out]">
          <a
            href={MESSENGER_URL}
            target="_blank"
            rel="noopener noreferrer"
            onClick={trackContact}
            className="text-xs font-semibold text-alta-purple-deep hover:text-alta-purple"
          >
            დახმარება გჭირდებათ?
          </a>
          <button
            type="button"
            onClick={dismissNudge}
            aria-label="შეტყობინების დახურვა"
            className="grid size-6 shrink-0 place-items-center rounded-full text-alta-300 transition hover:bg-alta-50 hover:text-alta-crimson focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-alta-purple"
          >
            <svg viewBox="0 0 20 20" aria-hidden className="size-3">
              <path
                d="M5 5l10 10M15 5L5 15"
                stroke="currentColor"
                strokeWidth="2.4"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>
      )}

      {/* Hover tooltip, pointer devices only — on a touch screen there is no
          hover state to reveal it, and it would only ever flash on tap. */}
      {!nudge && (
        <span
          aria-hidden
          className="alta-corners pointer-events-none hidden whitespace-nowrap bg-alta-purple-deep px-3 py-1.5 text-xs font-semibold text-white opacity-0 shadow-lg transition-opacity duration-200 group-hover:opacity-100 lg:block"
        >
          მოგვწერეთ
        </span>
      )}

      <a
        href={MESSENGER_URL}
        target="_blank"
        rel="noopener noreferrer"
        onClick={trackContact}
        aria-label="Messenger-ით დაკავშირება"
        className="grid size-12 shrink-0 place-items-center rounded-full shadow-[0_8px_24px_-6px_rgb(0_106_255_/_0.55)] transition-transform duration-200 hover:scale-[1.08] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-alta-purple sm:size-14"
        style={{
          backgroundImage: "linear-gradient(135deg, #00B2FF 0%, #006AFF 100%)",
        }}
      >
        <MessengerGlyph />
      </a>

      {/*
        Fallback for environments that block m.me — it resolves through a
        Facebook redirect that some networks and blocklists drop. Visually
        hidden rather than absent so it is still reachable by keyboard and by
        a screen reader, and still there for anyone reading the markup.
      */}
      <a
        href={PAGE_URL}
        target="_blank"
        rel="noopener noreferrer"
        onClick={trackContact}
        className="sr-only focus:not-sr-only focus:alta-corners focus:bg-alta-purple-deep focus:px-3 focus:py-1.5 focus:text-xs focus:font-semibold focus:text-white"
      >
        Facebook გვერდი
      </a>
    </div>
  );
}

function MessengerGlyph() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden
      className="size-6 fill-white sm:size-7"
    >
      <path d="M12 2C6.3 2 2 6.2 2 11.7c0 3.1 1.4 5.9 3.7 7.7v3.8l3.4-1.9c.9.3 1.9.4 2.9.4 5.7 0 10-4.2 10-9.7S17.7 2 12 2Zm1 13.1-2.5-2.7-5 2.7 5.5-5.8 2.6 2.7 4.9-2.7-5.5 5.8Z" />
    </svg>
  );
}
