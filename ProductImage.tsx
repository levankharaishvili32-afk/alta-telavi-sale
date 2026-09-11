"use client";

import Image from "next/image";
import { useCallback, useState } from "react";

const PLACEHOLDER = "/img/placeholder.svg";

/**
 * Product photos come straight from the shop's CDN.
 *
 *  - `unoptimized`: the URLs point at a third-party host, and routing hundreds
 *    of remote images through Next's optimizer means the server fetches each
 *    one. Loading them directly from the browser is what the shop itself does
 *    and avoids the whole class of server-side hotlink failures.
 *  - `onError`: a handful of catalog URLs really are dead, and a broken-image
 *    icon looks worse than a branded placeholder.
 *
 * The retry matters more than it looks. A burst of image requests to one host
 * queues behind the browser's per-host connection limit, and a request that
 * gives up under load raises exactly the same `error` event as a 404 — so
 * without it, a perfectly good photo gets replaced by the placeholder for the
 * rest of the session. One retry with a cache-busting query distinguishes
 * "briefly unavailable" from "gone"; only the second failure is believed.
 */
export default function ProductImage({
  src,
  alt,
  sizes,
  priority = false,
  className = "",
}: {
  src: string;
  alt: string;
  sizes: string;
  priority?: boolean;
  className?: string;
}) {
  const [attempt, setAttempt] = useState(0);
  // Reset when the caller swaps the photo (gallery thumbnails do this), so a
  // dead image never poisons the next one.
  const [syncedSrc, setSyncedSrc] = useState(src);
  if (syncedSrc !== src) {
    setSyncedSrc(src);
    setAttempt(0);
  }

  const onError = useCallback(() => {
    setAttempt((n) => (n >= 2 ? n : n + 1));
  }, []);

  const failed = !src || attempt >= 2;
  const resolved = failed
    ? PLACEHOLDER
    : attempt === 0
      ? src
      : `${src}${src.includes("?") ? "&" : "?"}retry=1`;

  return (
    <Image
      // Remounting on retry is what actually re-issues the request; without a
      // changed key React keeps the same <img> and the new src may be ignored.
      key={resolved}
      src={resolved}
      alt={alt}
      fill
      unoptimized
      priority={priority}
      sizes={sizes}
      onError={failed ? undefined : onError}
      className={className}
    />
  );
}
