"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import ProductImage from "./ProductImage";
import { useCompare } from "./CompareProvider";
import { discountPercent, formatPrice } from "@/lib/format";
import { recordComparison } from "@/lib/compare-pairs";
import {
  MIN_COMPARE,
  compareHref,
  resolveCompare,
  scopeLabel,
  specKeysForScope,
} from "@/lib/compare";

const DASH = "—";

/**
 * The comparison table.
 *
 * The URL is the source of truth, so a link is shareable and the back button
 * works; the localStorage selection is kept in step whenever a column is
 * dropped here, which is the only mutation this page performs.
 *
 * Layout is a CSS grid rather than a `<table>`: the first column has to stay
 * pinned while the rest scroll horizontally on a phone, and `position: sticky`
 * on a table cell is unreliable across browsers. Semantics are restored with
 * explicit `role="table"` / `row` / `cell`.
 */
export default function CompareTable() {
  const params = useSearchParams();
  const router = useRouter();
  const { remove } = useCompare();
  const [differencesOnly, setDifferencesOnly] = useState(false);

  const idsParam = params.get("ids");
  const { items, scope } = useMemo(() => resolveCompare(idsParam), [idsParam]);

  const rows = useMemo(() => {
    if (!scope || items.length === 0) return [];
    return specKeysForScope(scope).map((key) => {
      const values = items.map((p) => p.specs[key] ?? null);
      // Compare on the rendered value, so a row where *nobody* declares the
      // attribute counts as identical — three em dashes in a line tell the
      // shopper nothing and belong behind the differences-only toggle.
      const rendered = values.map((v) => v ?? DASH);
      const same = rendered.every((v) => v === rendered[0]);
      return { key, values, same };
    });
  }, [scope, items]);

  /*
   * Log the comparison as it happens. Keyed on the id set so re-renders — the
   * differences toggle, a column drop — do not inflate the counts; a genuinely
   * different set is a genuinely different comparison and gets its own entry.
   * Nothing reads this yet; see lib/compare-pairs.ts for what it is for.
   */
  const loggedRef = useRef<string | null>(null);
  const logKey = items.map((p) => p.id).join(",");
  useEffect(() => {
    if (!logKey || loggedRef.current === logKey) return;
    loggedRef.current = logKey;
    recordComparison(logKey.split(","));
  }, [logKey]);

  if (items.length === 0) return <EmptyState />;

  const prices = items.map((p) => p.promo_price);
  const lowest = Math.min(...prices);

  const dropColumn = (id: string) => {
    remove(id);
    const next = items.filter((p) => p.id !== id).map((p) => p.id);
    // One product left is not a comparison; send them back to the catalog
    // rather than leaving a single lonely column on screen.
    router.replace(next.length >= MIN_COMPARE ? compareHref(next) : "/#catalog");
  };

  const visibleRows = differencesOnly ? rows.filter((r) => !r.same) : rows;
  const identicalCount = rows.filter((r) => r.same).length;

  /*
   * Sized with clamp() rather than breakpoints because the template is an
   * inline style and Tailwind's responsive prefixes cannot reach it. The
   * viewport-relative middle term is what makes two product columns fit
   * alongside the pinned label column on a 390px screen — 26vw + 2×30vw is
   * 335px of the 358px available — while the caps keep it from stretching
   * absurdly on a desktop.
   */
  const gridTemplate =
    `clamp(6rem, 26vw, 10rem) ` +
    `repeat(${items.length}, minmax(clamp(7rem, 30vw, 11.5rem), 1fr))`;

  return (
    <div className="mt-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-alta-purple-deep sm:text-3xl">
            შედარება
          </h1>
          <p className="mt-1 text-sm text-alta-700">
            {items.length} პროდუქტი
            {scope ? ` · ${scopeLabel(scope)}` : ""}
          </p>
        </div>

        <button
          type="button"
          onClick={() => setDifferencesOnly((v) => !v)}
          aria-pressed={differencesOnly}
          className={`alta-corners inline-flex items-center gap-2.5 border px-5 py-3 text-sm font-bold transition ${
            differencesOnly
              ? "border-alta-purple bg-alta-purple text-white"
              : "border-alta-purple bg-white text-alta-purple hover:bg-alta-50"
          }`}
        >
          <span
            aria-hidden
            className={`grid size-5 place-items-center rounded-full border-2 ${
              differencesOnly
                ? "border-white bg-white text-alta-purple"
                : "border-alta-purple"
            }`}
          >
            {differencesOnly && (
              <svg viewBox="0 0 20 20" className="size-3">
                <path
                  d="M4 10.5l4 4 8-8.5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            )}
          </span>
          განსხვავებების ჩვენება
          {identicalCount > 0 && (
            <span
              className={`text-xs font-semibold ${
                differencesOnly ? "text-white/75" : "text-alta-400"
              }`}
            >
              ({identicalCount} ერთნაირი)
            </span>
          )}
        </button>
      </div>

      <div
        role="table"
        aria-label="პროდუქტების შედარება"
        /*
         * One scroll container for both axes, capped in height. `overflow-x`
         * alone would make this element a scroll container anyway, which
         * severs `position: sticky` from the page scroll and leaves the header
         * row pinned to nothing. Scrolling both axes here means the header row
         * and the label column both stay put, which is the whole point on a
         * table this wide.
         */
        className="alta-corners-xl mt-5 max-h-[75vh] snap-x snap-mandatory overflow-auto border border-alta-100 bg-white"
      >
        {/* Header */}
        <div
          role="row"
          className="sticky top-0 z-20 grid border-b border-alta-100 bg-white"
          style={{ gridTemplateColumns: gridTemplate }}
        >
          <div
            role="columnheader"
            className="sticky left-0 z-10 border-r border-alta-100 bg-white px-4 py-4"
          >
            <span className="text-xs font-medium text-alta-400">
              მახასიათებელი
            </span>
          </div>

          {items.map((product) => {
            const discount = discountPercent(product.old_price, product.promo_price);
            return (
              <div
                key={product.id}
                role="columnheader"
                className="relative snap-start border-r border-alta-100 px-3 py-4 last:border-r-0"
              >
                <button
                  type="button"
                  onClick={() => dropColumn(product.id)}
                  aria-label={`${product.title} — შედარებიდან ამოღება`}
                  className="absolute right-2 top-2 grid size-7 place-items-center rounded-md text-alta-300 transition hover:bg-alta-50 hover:text-alta-crimson"
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

                <div className="relative mx-auto aspect-square w-24 bg-white">
                  <ProductImage
                    src={product.image}
                    alt={product.title}
                    sizes="96px"
                    className="object-contain p-[8%]"
                  />
                </div>

                <p className="mt-2 line-clamp-2 text-xs font-semibold leading-snug text-alta-purple-deep">
                  {product.title}
                </p>

                <p className="mt-2 flex flex-wrap items-baseline gap-1.5">
                  <span className="text-base font-bold text-alta-purple">
                    {formatPrice(product.promo_price)}
                  </span>
                  {discount > 0 && (
                    <span className="text-xs font-medium text-alta-300 line-through">
                      {formatPrice(product.old_price)}
                    </span>
                  )}
                </p>
                {discount > 0 && (
                  <span className="alta-corners mt-1.5 inline-block bg-alta-teal px-2 py-0.5 text-[11px] font-bold text-alta-purple-deep">
                    −{discount}%
                  </span>
                )}

                <Link
                  href={`/product/${product.id}`}
                  className="mt-2 block text-xs font-bold text-alta-purple hover:underline"
                >
                  დეტალურად
                </Link>
              </div>
            );
          })}
        </div>

        {/* Price first — it is the row everyone reads before any spec. */}
        <Row
          label="ფასი"
          gridTemplate={gridTemplate}
          striped={false}
          highlight={items.length > 1}
        >
          {items.map((product) => (
            <Cell
              key={product.id}
              highlight={items.length > 1 && product.promo_price === lowest}
              tone="best"
            >
              <span className="font-bold text-alta-purple">
                {formatPrice(product.promo_price)}
              </span>
              {product.promo_price === lowest && items.length > 1 && (
                <span className="ml-1.5 text-[11px] font-bold text-alta-crimson">
                  ყველაზე იაფი
                </span>
              )}
            </Cell>
          ))}
        </Row>

        {visibleRows.map((row, i) => (
          <Row
            key={row.key}
            label={row.key}
            gridTemplate={gridTemplate}
            striped={i % 2 === 0}
            highlight={!row.same}
          >
            {row.values.map((value, j) => (
              <Cell key={items[j].id} highlight={!row.same} tone="diff">
                {value ?? <span className="text-alta-300">{DASH}</span>}
              </Cell>
            ))}
          </Row>
        ))}

        {visibleRows.length === 0 && (
          <p className="px-4 py-10 text-center text-sm text-alta-700">
            ამ პროდუქტებს ყველა მახასიათებელი ერთნაირი აქვს.
          </p>
        )}
      </div>

      <p className="mt-4 text-xs text-alta-400">
        „{DASH}“ ნიშნავს, რომ მწარმოებელს ეს მახასიათებელი მითითებული არ აქვს.
      </p>
    </div>
  );
}

function Row({
  label,
  gridTemplate,
  striped,
  highlight,
  children,
}: {
  label: string;
  gridTemplate: string;
  striped: boolean;
  highlight: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      role="row"
      data-differs={highlight ? "true" : "false"}
      className="grid border-b border-alta-100 last:border-b-0"
      style={{ gridTemplateColumns: gridTemplate }}
    >
      <div
        role="rowheader"
        className={`sticky left-0 z-10 border-r border-alta-100 px-4 py-3 text-xs font-medium leading-snug text-alta-400 ${
          striped ? "bg-alta-50" : "bg-white"
        }`}
      >
        {label}
      </div>
      {children}
    </div>
  );
}

function Cell({
  highlight,
  tone,
  children,
}: {
  highlight: boolean;
  tone: "diff" | "best";
  children: React.ReactNode;
}) {
  // A tint, not a colour: the point is to draw the eye down the row, not to
  // shout. `alta-50` is the same wash used by the striped label column.
  const bg = highlight
    ? tone === "best"
      ? "bg-alta-teal/15"
      : "bg-alta-50/70"
    : "";
  return (
    <div
      role="cell"
      className={`snap-start border-r border-alta-100 px-3 py-3 text-sm text-alta-purple-deep last:border-r-0 ${bg}`}
    >
      {children}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="alta-corners-xl mt-8 border-2 border-dashed border-alta-200 bg-alta-50 px-6 py-16 text-center">
      <p className="text-base font-bold text-alta-purple-deep">
        შესადარებელი პროდუქტი არ არის არჩეული
      </p>
      <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-alta-700">
        კატალოგში აირჩიეთ მინიმუმ {MIN_COMPARE} პროდუქტი ერთი კატეგორიიდან —
        თითოეულ ბარათზე იხილავთ ღილაკს „შედარება“.
      </p>
      <Link
        href="/#catalog"
        className="alta-corners mt-5 inline-block bg-alta-purple px-5 py-2.5 text-sm font-bold text-white transition hover:bg-alta-700"
      >
        კატალოგში დაბრუნება
      </Link>
    </div>
  );
}
