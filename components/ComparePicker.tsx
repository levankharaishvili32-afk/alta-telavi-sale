"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import ProductImage from "./ProductImage";
import Highlight from "./Highlight";
import { deepestDiscounts, products } from "@/lib/catalog";
import { compareHref, scopeLabel, scopeOf } from "@/lib/compare";
import { suggestionsFor, type Suggestion } from "@/lib/comparisons";
import { discountPercent, formatPrice } from "@/lib/format";
import { rangesFor, searchIn, searchProducts, type Range } from "@/lib/search";
import { installSearchQueriesHelper, recordSearch } from "@/lib/search-log";
import type { Product } from "@/lib/types";

const DEBOUNCE_MS = 200;
const MAX_RESULTS = 8;

/** Same zero-result answer as the catalog: the site's four best offers. */
const FALLBACK_PRODUCTS = deepestDiscounts(4);

/**
 * "ვის შევადაროთ?" — the picker that opens when someone asks to compare with
 * only one product selected.
 *
 * Comparing needs a second product, and the old behaviour (a dead button until
 * you found one yourself) put that work on the shopper. This asks the question
 * instead, and answers most of it up front with three precomputed suggestions.
 */
export default function ComparePicker({
  selected,
  onPick,
  onClose,
}: {
  selected: Product;
  onPick: (id: string) => void;
  onClose: () => void;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [allCategories, setAllCategories] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const scope = scopeOf(selected);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query), DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [query]);

  useEffect(() => {
    installSearchQueriesHelper();
    inputRef.current?.focus();
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

  /*
   * The same `searchProducts` the catalog field uses — transliteration,
   * aliases, typo tolerance and the product-code shortcut all included. Here a
   * code match is not navigated to but shown as the one result, because in
   * this modal the shopper is choosing a second product, not going somewhere.
   */
  const outcome = useMemo(() => searchProducts(debounced), [debounced]);

  const results = useMemo(() => {
    if (outcome.kind === "empty") return [];
    const pool = (
      allCategories ? products : products.filter((p) => scopeOf(p) === scope)
    ).filter((p) => p.id !== selected.id);
    return searchIn(debounced, pool, MAX_RESULTS);
  }, [outcome, debounced, allCategories, scope, selected.id]);

  useEffect(() => {
    if (outcome.kind === "text") recordSearch(debounced, outcome.hits.length);
  }, [debounced, outcome]);

  const suggestions = useMemo(
    () => suggestionsFor(selected.id, [], 3),
    [selected.id],
  );

  const pick = (id: string) => {
    onPick(id);
    router.push(compareHref([selected.id, id]));
  };

  const searching = debounced.trim().length > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 sm:items-center">
      <button
        type="button"
        aria-label="დახურვა"
        onClick={onClose}
        className="fixed inset-0 bg-alta-purple-deep/60"
      />

      <div
        role="dialog"
        aria-modal
        aria-labelledby="compare-picker-title"
        className="alta-corners-xl relative z-10 my-auto w-full max-w-2xl bg-white shadow-2xl"
      >
        {/* Header: the product already chosen, as a chip */}
        <div className="flex items-start justify-between gap-4 border-b border-alta-100 px-5 py-4">
          <div className="min-w-0">
            <h2
              id="compare-picker-title"
              className="text-base font-bold text-alta-purple-deep"
            >
              ვის შევადაროთ?
            </h2>
            <div className="alta-corners mt-2.5 inline-flex max-w-full items-center gap-2.5 border border-alta-100 bg-alta-50 py-1.5 pl-1.5 pr-3">
              <span className="relative size-9 shrink-0 overflow-hidden rounded bg-white">
                <ProductImage
                  src={selected.image}
                  alt=""
                  sizes="36px"
                  className="object-contain p-0.5"
                />
              </span>
              <span className="truncate text-xs font-semibold text-alta-purple-deep">
                {selected.title}
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="დახურვა"
            className="grid size-8 shrink-0 place-items-center rounded-md text-alta-400 transition hover:bg-alta-50"
          >
            ✕
          </button>
        </div>

        {/* Search */}
        <div className="border-b border-alta-100 px-5 py-4">
          <label htmlFor="compare-search" className="sr-only">
            პროდუქტის ძებნა შესადარებლად
          </label>
          <input
            id="compare-search"
            ref={inputRef}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="ძებნა დასახელებით, ბრენდით ან კოდით…"
            className="alta-corners w-full border border-alta-200 bg-white px-3.5 py-2.5 text-sm outline-none transition focus:border-alta-purple focus:ring-2 focus:ring-alta-100"
          />

          <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs">
            <p className="text-alta-400">
              {allCategories
                ? "ძებნა მიმდინარეობს ყველა კატეგორიაში — შედარება მხოლოდ ერთი კატეგორიის შიგნით მუშაობს."
                : `ძებნა შემოიფარგლება კატეგორიით „${scopeLabel(scope)}“, რადგან სხვადასხვა კატეგორიის მახასიათებლები ერთმანეთს არ ემთხვევა.`}
            </p>
            <button
              type="button"
              onClick={() => setAllCategories((v) => !v)}
              aria-pressed={allCategories}
              className="shrink-0 font-bold text-alta-purple underline-offset-2 hover:underline"
            >
              {allCategories ? "მხოლოდ ეს კატეგორია" : "ყველა კატეგორია"}
            </button>
          </div>
        </div>

        <div className="max-h-[55vh] overflow-y-auto px-5 py-4">
          {searching ? (
            results.length > 0 ? (
              <>
                <p className="mb-2.5 text-xs text-alta-400" aria-live="polite">
                  ნაპოვნია {results.length} პროდუქტი
                </p>
                <ul className="space-y-1.5">
                  {results.map((product) => (
                    <li key={product.id}>
                      <ResultRow
                        product={product}
                        highlight={rangesFor(outcome, product.id)}
                        onPick={pick}
                      />
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              /* Never a bare empty state — the same four best offers the
                 catalog falls back to, minus anything already chosen. */
              <div>
                <p className="text-center text-sm text-alta-700">
                  „{debounced}“ — ვერაფერი მოიძებნა
                  {allCategories ? "." : " ამ კატეგორიაში."}
                </p>
                <h3 className="mt-6 text-sm font-bold text-alta-purple-deep">
                  ყველაზე დიდი ფასდაკლებები
                </h3>
                <ul className="mt-2.5 space-y-1.5">
                  {FALLBACK_PRODUCTS.filter((p) => p.id !== selected.id).map(
                    (product) => (
                      <li key={product.id}>
                        <ResultRow product={product} onPick={pick} />
                      </li>
                    ),
                  )}
                </ul>
              </div>
            )
          ) : (
            <Suggestions suggestions={suggestions} onPick={pick} />
          )}
        </div>
      </div>
    </div>
  );
}

function Suggestions({
  suggestions,
  onPick,
}: {
  suggestions: Suggestion[];
  onPick: (id: string) => void;
}) {
  if (!suggestions.length) {
    return (
      <p className="py-8 text-center text-sm text-alta-700">
        ამ კატეგორიაში სხვა პროდუქტი არ არის — სცადეთ ძებნა.
      </p>
    );
  }

  // The fallback picks are honest about being a different thing: they are the
  // deepest discounts in the category, not products scored as similar.
  const popularOnly = suggestions.every((s) => s.kind === "popular");

  return (
    <div>
      <h3 className="text-sm font-bold text-alta-purple-deep">
        {popularOnly ? "პოპულარული ამ კატეგორიაში" : "ხშირად ადარებენ"}
      </h3>

      <ul className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
        {suggestions.map(({ product, kind }) => {
          const discount = discountPercent(product.old_price, product.promo_price);
          return (
            <li key={product.id}>
              <button
                type="button"
                onClick={() => onPick(product.id)}
                className="alta-corners group flex h-full w-full flex-row items-center gap-3 border border-alta-100 bg-white p-3 text-left transition hover:border-alta-purple hover:shadow-[0_10px_28px_-14px_rgb(61_41_86_/_0.35)] sm:flex-col sm:items-stretch sm:gap-0"
              >
                <div className="relative size-16 shrink-0 bg-white sm:size-auto sm:aspect-square sm:w-full">
                  <ProductImage
                    src={product.image}
                    alt={product.title}
                    sizes="120px"
                    className="object-contain p-[8%]"
                  />
                  {discount > 0 && (
                    <span className="alta-corners absolute left-0 top-0 bg-alta-teal px-1.5 py-0.5 text-[10px] font-bold text-alta-purple-deep">
                      −{discount}%
                    </span>
                  )}
                </div>

                <div className="min-w-0 sm:mt-2">
                  {!popularOnly && kind === "popular" && (
                    <p className="text-[10px] font-medium uppercase tracking-wide text-alta-400">
                      პოპულარული ამ კატეგორიაში
                    </p>
                  )}
                  <p className="line-clamp-2 text-xs font-semibold leading-snug text-alta-purple-deep group-hover:text-alta-purple">
                    {product.title}
                  </p>
                  <p className="mt-1 flex flex-wrap items-baseline gap-1.5">
                    <span className="text-sm font-bold text-alta-purple">
                      {formatPrice(product.promo_price)}
                    </span>
                    {discount > 0 && (
                      <span className="text-[11px] font-medium text-alta-300 line-through">
                        {formatPrice(product.old_price)}
                      </span>
                    )}
                  </p>
                </div>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function ResultRow({
  product,
  onPick,
  highlight,
}: {
  product: Product;
  onPick: (id: string) => void;
  highlight?: readonly Range[];
}) {
  const discount = discountPercent(product.old_price, product.promo_price);
  return (
    <button
      type="button"
      onClick={() => onPick(product.id)}
      className="alta-corners flex w-full items-center gap-3 border border-transparent px-2 py-2 text-left transition hover:border-alta-100 hover:bg-alta-50"
    >
      <span className="relative size-12 shrink-0 overflow-hidden rounded bg-white">
        <ProductImage
          src={product.image}
          alt=""
          sizes="48px"
          className="object-contain p-1"
        />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold text-alta-purple-deep">
          <Highlight text={product.title} ranges={highlight} />
        </span>
        <span className="block text-[11px] text-alta-400">
          {product.brand} · {product.id}
        </span>
      </span>
      <span className="shrink-0 text-right">
        <span className="block text-sm font-bold text-alta-purple">
          {formatPrice(product.promo_price)}
        </span>
        {discount > 0 && (
          <span className="block text-[11px] font-medium text-alta-300 line-through">
            {formatPrice(product.old_price)}
          </span>
        )}
      </span>
    </button>
  );
}
