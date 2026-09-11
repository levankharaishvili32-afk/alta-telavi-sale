"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import ProductImage from "./ProductImage";
import { formatPrice } from "@/lib/format";
import type { BundleItemResolved } from "@/lib/bundles";

export type BundleMain = {
  id: string;
  title: string;
  image: string;
  price: number;
  old_price: number | null;
  brand: string;
};

type Row = {
  key: string;
  title: string;
  image: string | null;
  price: number;
  oldPrice: number | null;
  /** null for the main product, which is never a link */
  href: string | null;
  external: boolean;
  typeLabel: string | null;
  item?: BundleItemResolved;
};

const CART_KEY = "alta-gldani-cart";

/**
 * "ერთად იაფია" — the frequently-bought-together card.
 *
 * The main product is row one and cannot be unchecked or removed; the
 * accessories under it can be either. The total in the footer is the sum of
 * whatever is currently checked, recalculated on every toggle.
 *
 * Accessories come from `data/bundles.json`, precomputed by
 * `npm run bundles`. A local accessory (also part of this campaign)
 * opens a quick-view here on the page; one that exists only in the wider
 * alta.ge catalog opens there in a new tab and is marked with an
 * external-link icon, so it is clear before the click which one it is.
 */
export default function BundleBox({
  main,
  items,
}: {
  main: BundleMain;
  items: BundleItemResolved[];
}) {
  const [removed, setRemoved] = useState<string[]>([]);
  const [unchecked, setUnchecked] = useState<string[]>([]);
  const [preview, setPreview] = useState<BundleItemResolved | null>(null);
  const [added, setAdded] = useState(0);

  const visible = items.filter((i) => !removed.includes(i.id));

  const rows: Row[] = useMemo(
    () => [
      {
        key: `main:${main.id}`,
        title: main.title,
        image: main.image,
        price: main.price,
        oldPrice: main.old_price,
        href: null,
        external: false,
        typeLabel: null,
      },
      ...visible.map((item) => ({
        key: item.id,
        title: item.title,
        image: item.image,
        price: item.price,
        oldPrice: item.old_price,
        href: item.href,
        external: item.source === "alta",
        typeLabel: item.type_label,
        item,
      })),
    ],
    [main, visible],
  );

  const checked = rows.filter(
    (r) => r.key.startsWith("main:") || !unchecked.includes(r.key),
  );
  const total = checked.reduce((sum, r) => sum + r.price, 0);
  // Rows without a discount still contribute their current price, so the
  // struck-through figure is never lower than the one next to it.
  const totalOld = checked.reduce((sum, r) => sum + (r.oldPrice ?? r.price), 0);

  // Deliberately not wrapped in useCallback: `checked` is derived on every
  // render, so a manual dependency array would only defeat the compiler's own
  // memoization (which it says as much about, loudly, at lint time).
  const addToCart = () => {
    try {
      const existing = JSON.parse(
        window.localStorage.getItem(CART_KEY) ?? "[]",
      ) as { id: string; qty: number }[];
      const byId = new Map(existing.map((e) => [e.id, e]));
      for (const row of checked) {
        const id = row.key.replace(/^main:/, "");
        const found = byId.get(id);
        if (found) found.qty += 1;
        else
          byId.set(id, {
            id,
            qty: 1,
            // Enough to render a cart later without re-reading the catalog.
            ...{
              title: row.title,
              price: row.price,
              image: row.image,
              href: row.href,
              external: row.external,
            },
          } as { id: string; qty: number });
      }
      window.localStorage.setItem(
        CART_KEY,
        JSON.stringify([...byId.values()]),
      );
      setAdded(checked.length);
    } catch {
      // Private mode or a full quota — the page must not break over a cart.
      setAdded(checked.length);
    }
  };

  useEffect(() => {
    if (!added) return;
    const t = setTimeout(() => setAdded(0), 3000);
    return () => clearTimeout(t);
  }, [added]);

  if (!items.length) return null;

  return (
    <section
      aria-labelledby="bundle-heading"
      className="alta-corners-xl mt-8 border border-alta-100 bg-white"
    >
      <div className="flex items-center gap-2.5 border-b border-alta-100 px-5 py-4">
        <span className="alta-corners bg-alta-teal px-2 py-1 text-[11px] font-bold text-alta-purple-deep">
          −{Math.max(0, Math.round(((totalOld - total) / totalOld) * 100)) || 0}%
        </span>
        <h2 id="bundle-heading" className="text-base font-bold text-alta-purple-deep">
          ერთად იაფია
        </h2>
      </div>

      <ul className="divide-y divide-alta-100">
        {rows.map((row, i) => {
          const isMain = i === 0;
          const isChecked = isMain || !unchecked.includes(row.key);
          return (
            <li
              key={row.key}
              className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:gap-4 sm:px-5"
            >
              <div className="flex min-w-0 flex-1 items-center gap-3 sm:gap-4">
                <input
                  type="checkbox"
                  checked={isChecked}
                  disabled={isMain}
                  onChange={() =>
                    setUnchecked((prev) =>
                      prev.includes(row.key)
                        ? prev.filter((k) => k !== row.key)
                        : [...prev, row.key],
                    )
                  }
                  aria-label={
                    isMain ? `${row.title} — ძირითადი პროდუქტი` : row.title
                  }
                  className="size-4 shrink-0 accent-alta-purple disabled:opacity-60"
                />

                <div className="relative size-16 shrink-0 overflow-hidden rounded-md bg-white sm:size-20">
                  <ProductImage
                    src={row.image ?? ""}
                    alt=""
                    sizes="80px"
                    className="object-contain p-1.5"
                  />
                </div>

                <div className="min-w-0">
                  {row.typeLabel && (
                    <p className="text-[11px] font-medium uppercase tracking-wide text-alta-400">
                      {row.typeLabel}
                    </p>
                  )}
                  {isMain ? (
                    <p className="truncate text-sm font-semibold text-alta-purple-deep sm:whitespace-normal">
                      {row.title}
                    </p>
                  ) : (
                    <AccessoryTitle row={row} onPreview={setPreview} />
                  )}
                  {isMain && (
                    <p className="mt-0.5 text-[11px] font-medium text-alta-400">
                      ეს პროდუქტი
                    </p>
                  )}
                </div>
              </div>

              <div className="flex items-center justify-between gap-3 pl-7 sm:justify-end sm:pl-0">
                <div className="text-right">
                  <p className="text-sm font-bold text-alta-purple">
                    {formatPrice(row.price)}
                  </p>
                  {row.oldPrice && (
                    <p className="text-xs font-medium text-alta-300 line-through">
                      {formatPrice(row.oldPrice)}
                    </p>
                  )}
                </div>

                {!isMain && (
                  <button
                    type="button"
                    onClick={() => setRemoved((prev) => [...prev, row.key])}
                    aria-label={`${row.title} — წაშლა`}
                    className="grid size-8 shrink-0 place-items-center rounded-md text-alta-300 transition hover:bg-alta-50 hover:text-alta-crimson"
                  >
                    <svg viewBox="0 0 20 20" aria-hidden className="size-4">
                      <path
                        d="M5 5l10 10M15 5L5 15"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                      />
                    </svg>
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      <div className="flex flex-col gap-4 border-t border-alta-100 bg-alta-50 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-medium text-alta-400">
            ჯამური ფასი ({checked.length})
          </p>
          <p className="mt-0.5 flex flex-wrap items-baseline gap-2">
            <span className="text-2xl font-bold text-alta-purple">
              {formatPrice(total)}
            </span>
            {totalOld > total && (
              <span className="text-sm font-medium text-alta-300 line-through">
                {formatPrice(totalOld)}
              </span>
            )}
          </p>
          <p
            className="mt-1 text-xs font-semibold text-alta-crimson empty:hidden"
            aria-live="polite"
          >
            {added ? `კალათაში დაემატა ${added} ნივთი` : ""}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={addToCart}
            className="alta-corners flex-1 bg-alta-purple px-7 py-3 text-sm font-bold text-white transition hover:bg-alta-700 sm:flex-none"
          >
            ყიდვა
          </button>
          <button
            type="button"
            onClick={addToCart}
            aria-label="კალათაში დამატება"
            className="alta-corners grid size-11 shrink-0 place-items-center border border-alta-200 bg-white text-alta-purple transition hover:bg-white/60"
          >
            <svg viewBox="0 0 24 24" aria-hidden className="size-5">
              <path
                d="M3 4h2.2l2.3 11h9.6l2.1-8H6.2"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <circle cx="9.5" cy="19" r="1.5" />
              <circle cx="17" cy="19" r="1.5" />
            </svg>
          </button>
        </div>
      </div>

      {preview && (
        <QuickView item={preview} onClose={() => setPreview(null)} />
      )}
    </section>
  );
}

/**
 * A local accessory opens the quick-view; an alta.ge one is a plain outbound
 * link carrying the external-link glyph, so the two never look alike.
 */
function AccessoryTitle({
  row,
  onPreview,
}: {
  row: Row;
  onPreview: (item: BundleItemResolved) => void;
}) {
  const className =
    "line-clamp-2 text-left text-sm font-semibold text-alta-purple-deep transition hover:text-alta-purple";

  if (row.item?.source === "local") {
    return (
      <button type="button" onClick={() => onPreview(row.item!)} className={className}>
        {row.title}
      </button>
    );
  }

  return (
    <a
      href={row.href ?? "#"}
      target="_blank"
      rel="noopener noreferrer"
      className={`${className} inline-flex items-start gap-1`}
    >
      <span className="min-w-0">{row.title}</span>
      <svg
        viewBox="0 0 16 16"
        aria-hidden
        className="mt-0.5 size-3.5 shrink-0 text-alta-400"
      >
        <path
          d="M6 3h7v7M13 3 6.5 9.5M11 10.5V13H3V5h2.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <span className="sr-only">(alta.ge-ზე იხსნება)</span>
    </a>
  );
}

/** Quick-view for a local accessory — the shopper never leaves the page. */
function QuickView({
  item,
  onClose,
}: {
  item: BundleItemResolved;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  const specs = Object.entries(item.specs ?? {});

  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4">
      <button
        type="button"
        aria-label="დახურვა"
        onClick={onClose}
        className="absolute inset-0 bg-alta-purple-deep/60"
      />
      <div
        role="dialog"
        aria-modal
        aria-label={item.title}
        className="alta-corners-xl relative z-10 max-h-[85vh] w-full max-w-2xl overflow-y-auto bg-white shadow-2xl"
      >
        <div className="flex items-start justify-between gap-4 border-b border-alta-100 px-5 py-4">
          <p className="text-sm font-bold text-alta-purple-deep">სწრაფი ნახვა</p>
          <button
            type="button"
            onClick={onClose}
            aria-label="დახურვა"
            className="grid size-8 shrink-0 place-items-center rounded-md text-alta-400 transition hover:bg-alta-50"
          >
            ✕
          </button>
        </div>

        <div className="grid gap-5 p-5 sm:grid-cols-[minmax(0,220px)_minmax(0,1fr)]">
          <div className="alta-corners relative aspect-square overflow-hidden border border-alta-100 bg-white">
            <ProductImage
              src={item.image ?? ""}
              alt={item.title}
              sizes="220px"
              className="object-contain p-[13%]"
            />
          </div>

          <div className="min-w-0">
            {item.subtitle && (
              <p className="text-xs font-medium uppercase tracking-wide text-alta-400">
                {item.subtitle}
              </p>
            )}
            <h3 className="mt-1 text-lg font-bold leading-snug text-alta-purple-deep">
              {item.title}
            </h3>

            <p className="mt-3 flex flex-wrap items-baseline gap-2">
              <span className="text-2xl font-bold text-alta-purple">
                {formatPrice(item.price)}
              </span>
              {item.old_price && (
                <span className="text-sm font-medium text-alta-300 line-through">
                  {formatPrice(item.old_price)}
                </span>
              )}
            </p>

            {specs.length > 0 && (
              <dl className="mt-4 space-y-1.5">
                {specs.map(([key, value]) => (
                  <div key={key} className="flex gap-3 text-sm">
                    {/* Fixed width, not min-width: alta.ge spec labels run to
                        60+ characters and a growing column shoves the value
                        clean off the dialog. */}
                    <dt className="w-32 shrink-0 text-alta-400">{key}</dt>
                    <dd className="min-w-0 font-medium text-alta-purple-deep">
                      {value}
                    </dd>
                  </div>
                ))}
              </dl>
            )}

            <Link
              href={`/product/${item.id}`}
              className="alta-corners mt-5 inline-block bg-alta-purple px-5 py-2.5 text-sm font-bold text-white transition hover:bg-alta-700"
            >
              სრულად ნახვა
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
