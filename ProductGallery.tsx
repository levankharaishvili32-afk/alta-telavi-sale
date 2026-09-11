"use client";

import { useState } from "react";
import ProductImage from "./ProductImage";

/**
 * Main photo plus the feed's `g:additional_image_link` thumbnails. Rendered
 * only when the feed actually supplies extras, so single-image products keep
 * the plain layout.
 */
export default function ProductGallery({
  images,
  alt,
}: {
  images: string[];
  alt: string;
}) {
  const [active, setActive] = useState(0);
  const current = images[active] ?? images[0];

  return (
    <div>
      <div className="alta-corners-xl relative overflow-hidden border border-alta-100 bg-white">
        {/* The feed crops product photos tight — often edge to edge — so the
            tile supplies the white margin the brand reference calls for:
            13% each side leaves the product at ~73% of the tile. */}
        <div className="relative aspect-square">
          <ProductImage
            key={current}
            src={current}
            alt={alt}
            priority
            sizes="(max-width: 1024px) 100vw, 50vw"
            className="object-contain p-[13%]"
          />
        </div>
      </div>

      {images.length > 1 && (
        <ul className="mt-3 flex flex-wrap gap-3">
          {images.map((src, i) => (
            <li key={src}>
              <button
                type="button"
                onClick={() => setActive(i)}
                aria-label={`ფოტო ${i + 1}`}
                aria-current={i === active}
                className={`alta-corners relative block size-20 overflow-hidden border-2 bg-white transition ${
                  i === active
                    ? "border-alta-purple"
                    : "border-alta-100 hover:border-alta-300"
                }`}
              >
                <ProductImage
                  src={src}
                  alt=""
                  sizes="80px"
                  className="object-contain p-1.5"
                />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
