"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { products } from "@/lib/catalog";
import { discountPercent } from "@/lib/format";
import { CAMPAIGN_END_INCLUSIVE } from "@/lib/campaign";
import {
  applyFilters,
  buildSearchParams,
  computeFacets,
  EMPTY_FILTERS,
  parseFilters,
  SORTS,
  activeFilterCount,
  type Filters,
  type FilterUpdate,
  type Sort,
} from "@/lib/filters";
import ProductCard from "./ProductCard";
import FilterPanel from "./FilterPanel";
import ActiveChips from "./ActiveChips";

export default function Catalog() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const urlKey = searchParams.toString();
  const urlFilters = useMemo(
    () => parseFilters(new URLSearchParams(urlKey)),
    [urlKey],
  );

  /*
   * Filters live in local state and are *mirrored* to the URL, rather than the
   * URL being the live source of truth. Two reasons:
   *  - functional updates stay coherent when several changes land in the same
   *    tick (ticking two checkboxes fast never drops one);
   *  - the UI repaints immediately instead of waiting for a router round-trip.
   * The URL still fully describes the view, so links remain shareable.
   */
  const [filters, setFilters] = useState<Filters>(urlFilters);

  const canonical = useMemo(
    () => buildSearchParams(filters).toString(),
    [filters],
  );

  // The last query string this component wrote. Used to tell our own URL
  // updates (which echo back through useSearchParams a tick later) apart from
  // genuine external navigation.
  const lastWrittenRef = useRef<string | null>(null);

  // Mirror state into the address bar. `history.replaceState` rather than
  // `router.replace`: it is synchronous and strictly ordered, so two filter
  // changes in quick succession can't land out of order and drop one — and it
  // avoids a router transition for what is only a query-string change. Replace
  // (not push) keeps filtering out of the back stack, so "back" leaves the page.
  useEffect(() => {
    lastWrittenRef.current = canonical;
    const query = canonical ? `?${canonical}` : "";
    const { pathname: livePath, search, hash } = window.location;
    const target = `${pathname}${query}${hash}`;
    if (`${livePath}${search}${hash}` === target) return;
    window.history.replaceState(window.history.state, "", target);
  }, [canonical, pathname]);

  // Adopt URL changes that did NOT originate here: back/forward, a header link
  // to /?cat=…, or a pasted link. Anything matching our own last write is an
  // echo — adopting it would clobber changes made since that write.
  useEffect(() => {
    if (lastWrittenRef.current === null) return;
    const incoming = buildSearchParams(urlFilters).toString();
    if (incoming === lastWrittenRef.current) return;
    lastWrittenRef.current = incoming;
    setFilters(urlFilters);
  }, [urlFilters]);

  const update = useCallback(
    (patch: FilterUpdate) =>
      setFilters((prev) => ({
        ...prev,
        ...(typeof patch === "function" ? patch(prev) : patch),
      })),
    [],
  );

  const clearAll = useCallback(
    () => setFilters((prev) => ({ ...EMPTY_FILTERS, sort: prev.sort })),
    [],
  );

  /* --- debounced search box ---------------------------------------- */
  const [query, setQuery] = useState(filters.q);
  // Adopt an externally-changed query (chip removal, "clear all", back button)
  // during render rather than in an effect.
  const [syncedQuery, setSyncedQuery] = useState(filters.q);
  if (syncedQuery !== filters.q) {
    setSyncedQuery(filters.q);
    setQuery(filters.q);
  }
  useEffect(() => {
    const t = setTimeout(
      () => setFilters((prev) => (prev.q === query ? prev : { ...prev, q: query })),
      250,
    );
    return () => clearTimeout(t);
  }, [query]);

  /* --- mobile drawer ------------------------------------------------ */
  const [drawerOpen, setDrawerOpen] = useState(false);
  useEffect(() => {
    if (!drawerOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setDrawerOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
    };
  }, [drawerOpen]);

  const results = useMemo(() => applyFilters(products, filters), [filters]);
  const facets = useMemo(() => computeFacets(products, filters), [filters]);
  /*
   * The advertised headline figure, which is not the computed one. The deepest
   * actual discount in the catalog is 77%, and the campaign advertises 80% —
   * "80%-მდე" means *up to* 80%, so that still holds.
   *
   * Taken as a maximum against the real figure rather than replacing it: if a
   * future price import pushes the true deepest discount past 80, the page
   * prints the real, larger number instead of quietly under-promising.
   */
  const HEADLINE_MAX_DISCOUNT = 80;
  const actualMaxDiscount = useMemo(
    () =>
      Math.max(
        ...products.map((p) => discountPercent(p.old_price, p.promo_price)),
      ),
    [],
  );
  const maxDiscount = Math.max(HEADLINE_MAX_DISCOUNT, actualMaxDiscount);
  const activeCount = activeFilterCount(filters);
  const shareQuery = canonical ? `?${canonical}` : "";

  /* --- incremental rendering ---------------------------------------
   * The unfiltered catalog is a few hundred products. Painting every card at
   * once asks the browser for that many CDN images in one burst; past the
   * per-host connection limit the tail of them time out, and a timed-out
   * product photo is indistinguishable from a dead one — the card silently
   * shows the placeholder. Rendering a page at a time keeps the burst small.
   */
  const PAGE = 36;
  const [shown, setShown] = useState(PAGE);
  // Reset to the first page whenever the result set itself changes, during
  // render rather than in an effect so no over-long list is ever painted.
  const [shownFor, setShownFor] = useState(canonical);
  if (shownFor !== canonical) {
    setShownFor(canonical);
    setShown(PAGE);
  }
  const visible = results.slice(0, shown);

  const renderPanel = (showHeading: boolean) => (
    <FilterPanel
      filters={filters}
      facets={facets}
      onChange={update}
      onClearAll={clearAll}
      showHeading={showHeading}
    />
  );

  return (
    <section
      id="catalog"
      className="mx-auto max-w-7xl scroll-mt-20 px-4 pb-10 pt-2 sm:px-6 lg:px-8"
    >
      {/* The page's only h1. Kept to one plain line rather than a banner block:
          every document needs a top-level heading for screen readers and for
          search results, and this is the page's actual subject. */}
      <header className="mb-6 border-b border-alta-100 pb-5">
        <h1 className="text-2xl font-bold text-alta-purple-deep sm:text-3xl">
          დიდი ფასდაკლება თელავში!
        </h1>
        <p className="mt-1.5 text-sm text-alta-700">
          {products.length} პროდუქტი {maxDiscount}%-მდე ფასდაკლებით —{" "}
          {CAMPAIGN_END_INCLUSIVE}.
        </p>
      </header>

      <div className="lg:grid lg:grid-cols-[280px_minmax(0,1fr)] lg:gap-8">
        {/* Desktop sidebar */}
        <aside className="hidden lg:block">
          <div className="alta-corners sticky top-28 max-h-[calc(100vh-8rem)] overflow-y-auto border border-alta-100 bg-white p-5">
            {renderPanel(true)}
          </div>
        </aside>

        <div className="min-w-0">
          {/* Toolbar */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative min-w-0 flex-1 basis-full sm:basis-64">
              <svg
                aria-hidden
                viewBox="0 0 20 20"
                fill="none"
                className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-alta-400"
              >
                <circle
                  cx="9"
                  cy="9"
                  r="6"
                  stroke="currentColor"
                  strokeWidth="1.8"
                />
                <path
                  d="M13.5 13.5 17 17"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                />
              </svg>
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="ძებნა დასახელებით…"
                aria-label="პროდუქტის ძებნა დასახელებით"
                className="alta-corners w-full border border-alta-200 bg-white py-2.5 pl-9 pr-3 text-sm outline-none transition focus:border-alta-purple focus:ring-2 focus:ring-alta-100"
              />
            </div>

            <button
              type="button"
              onClick={() => setDrawerOpen(true)}
              className="alta-corners inline-flex items-center gap-2 border border-alta-200 bg-white px-3.5 py-2.5 text-sm font-semibold text-alta-purple-deep transition hover:bg-alta-50 lg:hidden"
            >
              <svg aria-hidden viewBox="0 0 20 20" className="size-4">
                <path
                  d="M3 5h14M6 10h8M8.5 15h3"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                />
              </svg>
              ფილტრი
              {activeCount > 0 && (
                <span className="grid size-5 place-items-center rounded-full bg-alta-crimson text-[11px] font-bold text-white">
                  {activeCount}
                </span>
              )}
            </button>

            <div className="ml-auto flex min-w-0 items-center gap-2">
              <label
                htmlFor="sort"
                className="hidden shrink-0 text-xs font-medium text-alta-400 sm:block"
              >
                დალაგება
              </label>
              <select
                id="sort"
                value={filters.sort}
                onChange={(e) => update({ sort: e.target.value as Sort })}
                className="alta-corners min-w-0 border border-alta-200 bg-white px-3 py-2.5 text-sm font-medium text-alta-purple-deep outline-none transition focus:border-alta-purple focus:ring-2 focus:ring-alta-100"
              >
                {SORTS.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Chips */}
          <div className="mt-4 empty:mt-0">
            <ActiveChips
              filters={filters}
              onChange={update}
              onClearAll={clearAll}
            />
          </div>

          {/* Result count */}
          <div className="mt-4 flex items-baseline gap-2 border-b border-alta-100 pb-3">
            <p className="text-sm text-alta-700" aria-live="polite">
              ნაპოვნია{" "}
              <span className="font-bold text-alta-purple">{results.length}</span>{" "}
              პროდუქტი
              {activeCount > 0 && (
                <span className="text-alta-300"> / {products.length}</span>
              )}
            </p>
          </div>

          {/* Grid */}
          {results.length > 0 ? (
            <>
              <div className="mt-6 grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
                {visible.map((p) => (
                  <ProductCard key={p.id} product={p} query={shareQuery} />
                ))}
              </div>

              {shown < results.length && (
                <div className="mt-8 flex flex-col items-center gap-3">
                  <p className="text-sm text-alta-400">
                    ნაჩვენებია {visible.length} / {results.length}
                  </p>
                  <button
                    type="button"
                    onClick={() => setShown((n) => n + PAGE)}
                    className="alta-corners bg-alta-purple px-6 py-3 text-sm font-bold text-white transition hover:bg-alta-700"
                  >
                    კიდევ {Math.min(PAGE, results.length - shown)} პროდუქტის
                    ჩვენება
                  </button>
                </div>
              )}
            </>
          ) : (
            <div className="alta-corners mt-10 border-2 border-dashed border-alta-200 bg-alta-50 px-6 py-16 text-center">
              <p className="text-base font-bold text-alta-purple-deep">
                შედეგი ვერ მოიძებნა
              </p>
              <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-alta-700">
                სცადეთ ფილტრების შემსუბუქება ან სხვა საძიებო სიტყვა.
              </p>
              <button
                type="button"
                onClick={clearAll}
                className="alta-corners mt-5 bg-alta-purple px-5 py-2.5 text-sm font-bold text-white transition hover:bg-alta-700"
              >
                ფილტრების გასუფთავება
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Mobile drawer */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal>
          <button
            type="button"
            aria-label="ფილტრების დახურვა"
            onClick={() => setDrawerOpen(false)}
            className="absolute inset-0 bg-alta-purple-deep/60"
          />
          <div className="absolute inset-y-0 left-0 flex w-[88%] max-w-sm flex-col bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-alta-100 px-5 py-4">
              <p className="text-base font-bold text-alta-purple-deep">ფილტრები</p>
              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                className="grid size-8 place-items-center rounded-md text-alta-400 transition hover:bg-alta-50"
                aria-label="დახურვა"
              >
                ✕
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-5">{renderPanel(false)}</div>

            <div className="border-t border-alta-100 p-4">
              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                className="alta-corners w-full bg-alta-purple px-4 py-3 text-sm font-bold text-white transition hover:bg-alta-700"
              >
                ნახეთ {results.length} პროდუქტი
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
