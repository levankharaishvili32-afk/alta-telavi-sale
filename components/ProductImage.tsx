"use client";

import Image from "next/image";
import { useState } from "react";

/**
 * Product photos come straight from the shop's CDN via the Meta catalog feed.
 * Two consequences handled here:
 *
 *  - `unoptimized`: the feed points at a third-party host, and routing 128
 *    remote images through Next's optimizer means the server fetches each one.
 *    Loading them directly from the browser is what the shop itself does and
 *    avoids the whole class of server-side hotlink failures.
 *  - `onError`: catalog feeds always contain a few dead image URLs. Rather than
 *    a broken-image icon, fall back to a branded placeholder.
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
  const [failed, setFailed] = useState(false);
  const resolved = failed || !src ? "/img/placeholder.svg" : src;

  return (
    <Image
      src={resolved}
      alt={alt}
      fill
      unoptimized
      priority={priority}
      sizes={sizes}
      onError={() => setFailed(true)}
      className={className}
    />
  );
}
