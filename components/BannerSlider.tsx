"use client";

import Image from "next/image";
import Link from "next/link";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { banners, type Banner } from "@/lib/banners";

const INTERVAL = 6000;

/**
 * Campaign banner carousel, placed between the hero and the catalog.
 *
 * Two crops per slide (the shop supplies a wide one for desktop and a shorter
 * one for phones) are both in the markup, swapped with CSS at the `sm`
 * breakpoint. Each is wrapped in a fixed-aspect box so the slot occupies its
 * final height on first paint — a carousel that resizes once the first image
 * decodes shoves the catalog down the page.
 *
 * Only the first slide is eager and `priority`; the rest load lazily, so a
 * two-slide carousel doesn't compete with the product grid for bandwidth.
 */
export default function BannerSlider() {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const count = banners.length;

  const go = useCallback(
    (next: number) => setIndex(((next % count) + count) % count),
    [count],
  );

  // Autoplay, suspended while the pointer or keyboard focus is inside the
  // carousel and for anyone who asked for reduced motion.
  const reducedMotion = useReducedMotion();
  useEffect(() => {
    if (count < 2 || paused || reducedMotion) return;
    const timer = setInterval(() => setIndex((i) => (i + 1) % count), INTERVAL);
    return () => clearInterval(timer);
  }, [count, paused, reducedMotion]);

  // Swipe. Pointer events cover touch and mouse drag with one code path.
  const startX = useRef<number | null>(null);
  const onPointerDown = (e: React.PointerEvent) => {
    startX.current = e.clientX;
  };
  const onPointerUp = (e: React.PointerEvent) => {
    if (startX.current === null) return;
    const dx = e.clientX - startX.current;
    startX.current = null;
    if (Math.abs(dx) > 40) go(index + (dx < 0 ? 1 : -1));
  };

  if (count === 0) return null;

  return (
    <section
      aria-roledescription="carousel"
      aria-label="აქციური ბანერები"
      className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
      onKeyDown={(e) => {
        if (e.key === "ArrowRight") go(index + 1);
        if (e.key === "ArrowLeft") go(index - 1);
      }}
    >
      <div
        className="alta-corners-xl group relative overflow-hidden bg-alta-50"
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
      >
        {banners.map((banner, i) => (
          <Slide
            key={banner.id}
            banner={banner}
            active={i === index}
            first={i === 0}
          />
        ))}

        {count > 1 && (
          <>
            <Arrow side="left" onClick={() => go(index - 1)} />
            <Arrow side="right" onClick={() => go(index + 1)} />

            {/* Banner artwork ranges from near-black to near-white, so the
                dots ride on their own translucent pill instead of relying on
                contrast with whatever is behind them. */}
            <div className="absolute inset-x-0 bottom-3 flex justify-center">
              <div className="flex items-center gap-2 rounded-full bg-black/25 px-2.5 py-1.5 backdrop-blur-sm">
                {banners.map((banner, i) => (
                  <button
                    key={banner.id}
                    type="button"
                    onClick={() => go(i)}
                    aria-label={`ბანერი ${i + 1}`}
                    aria-current={i === index}
                    className={`h-2 rounded-full transition-all ${
                      i === index
                        ? "w-6 bg-white"
                        : "w-2 bg-white/60 hover:bg-white/90"
                    }`}
                  />
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </section>
  );
}

function Slide({
  banner,
  active,
  first,
}: {
  banner: Banner;
  active: boolean;
  first: boolean;
}) {
  const inner = (
    <>
      <Image
        src={banner.mobile.src}
        alt={banner.alt}
        width={banner.mobile.width}
        height={banner.mobile.height}
        priority={first}
        loading={first ? undefined : "lazy"}
        sizes="100vw"
        className="h-full w-full object-cover sm:hidden"
      />
      <Image
        src={banner.desktop.src}
        alt={banner.alt}
        width={banner.desktop.width}
        height={banner.desktop.height}
        priority={first}
        loading={first ? undefined : "lazy"}
        sizes="(max-width: 1280px) 100vw, 1280px"
        className="hidden h-full w-full object-cover sm:block"
      />
    </>
  );

  return (
    <div
      // The first slide is in normal flow and defines the box's height; the
      // rest are absolutely positioned on top of it and cross-fade.
      className={`${first ? "relative" : "absolute inset-0"} transition-opacity duration-500 ${
        active ? "opacity-100" : "pointer-events-none opacity-0"
      }`}
      aria-hidden={!active}
      // aria-hidden alone would still leave the offscreen link tabbable.
      inert={!active}
    >
      <div className="aspect-[1088/443] w-full sm:aspect-[1458/453]">
        {banner.href ? (
          <Link href={banner.href} className="block h-full w-full">
            {inner}
          </Link>
        ) : (
          inner
        )}
      </div>
    </div>
  );
}

function Arrow({
  side,
  onClick,
}: {
  side: "left" | "right";
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={side === "left" ? "წინა ბანერი" : "შემდეგი ბანერი"}
      /* Hidden below `sm` — on a 358px-wide banner the buttons land on the
         artwork's own headline, and swiping already works there. Above `sm`
         they fade in on hover or keyboard focus: these banners run their text
         close to the edge, so a permanently visible arrow would sit on top of
         "უკვე" and "Ultra2". The dots stay visible as the standing cue that
         there is more than one slide. */
      className={`absolute top-1/2 z-10 hidden size-12 -translate-y-1/2 place-items-center rounded-full bg-white/85 text-alta-purple-deep opacity-0 shadow-md ring-1 ring-alta-purple-deep/10 backdrop-blur transition hover:bg-white focus-visible:opacity-100 group-hover:opacity-100 sm:grid ${
        side === "left" ? "left-5" : "right-5"
      }`}
    >
      <svg viewBox="0 0 24 24" aria-hidden className="size-6">
        <path
          d={side === "left" ? "M15 5 8 12l7 7" : "M9 5l7 7-7 7"}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  );
}

const MOTION_QUERY = "(prefers-reduced-motion: reduce)";

function subscribeToMotionPreference(onChange: () => void) {
  const mq = window.matchMedia(MOTION_QUERY);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}

/**
 * `prefers-reduced-motion` as an external store rather than effect-plus-state:
 * the value is read during render on the client and reported as `false` on the
 * server, so there is no extra render pass and no hydration mismatch.
 */
function useReducedMotion() {
  return useSyncExternalStore(
    subscribeToMotionPreference,
    () => window.matchMedia(MOTION_QUERY).matches,
    () => false,
  );
}
