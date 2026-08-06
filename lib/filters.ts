import type { Product } from "./types";
import { discountPercent } from "./format";
import { specKeysForCategory } from "./catalog";
import { searchIds } from "./search";

export const SORTS = [
  { value: "price-desc", label: "ფასი: კლებადობით" },
  { value: "price-asc", label: "ფასი: ზრდადობით" },
] as const;

export type Sort = (typeof SORTS)[number]["value"];
export const DEFAULT_SORT: Sort = "price-desc";

export type Filters = {
  q: string;
  category: string | null;
  subcategories: string[];
  brands: string[];
  min: number | null;
  max: number | null;
  /** spec key -> selected values */
  specs: Record<string, string[]>;
  inStockOnly: boolean;
  sort: Sort;
};

/**
 * A filter change. Use the function form for anything derived from the current
 * value (toggling a list item), so simultaneous changes compose instead of
 * clobbering each other; the plain-object form is fine for outright
 * replacements (picking a category, choosing a sort).
 */
export type FilterUpdate =
  | Partial<Filters>
  | ((prev: Filters) => Partial<Filters>);

export const EMPTY_FILTERS: Filters = {
  q: "",
  category: null,
  subcategories: [],
  brands: [],
  min: null,
  max: null,
  specs: {},
  inStockOnly: false,
  sort: DEFAULT_SORT,
};

/* ------------------------------------------------------------------ */
/* URL <-> state                                                       */
/* ------------------------------------------------------------------ */

const SPEC_PREFIX = "s.";
const LIST_SEP = ",";

const splitList = (raw: string | null): string[] =>
  raw
    ? raw
        .split(LIST_SEP)
        .map((v) => v.trim())
        .filter(Boolean)
    : [];

const parseNumber = (raw: string | null): number | null => {
  if (raw === null || raw.trim() === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : null;
};

export function parseFilters(sp: URLSearchParams): Filters {
  const category = sp.get("cat");
  const specs: Record<string, string[]> = {};
  for (const [key, value] of sp.entries()) {
    if (!key.startsWith(SPEC_PREFIX)) continue;
    const specKey = key.slice(SPEC_PREFIX.length);
    if (!specKey) continue;
    const values = splitList(value);
    if (values.length) specs[specKey] = values;
  }

  let min = parseNumber(sp.get("min"));
  let max = parseNumber(sp.get("max"));
  if (min !== null && max !== null && min > max) [min, max] = [max, min];

  const sortRaw = sp.get("sort");
  const sort = SORTS.some((s) => s.value === sortRaw)
    ? (sortRaw as Sort)
    : DEFAULT_SORT;

  return {
    q: sp.get("q")?.trim() ?? "",
    category: category || null,
    subcategories: category ? splitList(sp.get("sub")) : [],
    brands: splitList(sp.get("brand")),
    min,
    max,
    specs: category ? specs : {},
    inStockOnly: sp.get("stock") === "1",
    sort,
  };
}

/** Serializes only non-default values, so a clean view has a clean URL. */
export function buildSearchParams(f: Filters): URLSearchParams {
  const sp = new URLSearchParams();
  if (f.q) sp.set("q", f.q);
  if (f.category) sp.set("cat", f.category);
  if (f.category && f.subcategories.length)
    sp.set("sub", f.subcategories.join(LIST_SEP));
  if (f.brands.length) sp.set("brand", f.brands.join(LIST_SEP));
  if (f.min !== null) sp.set("min", String(f.min));
  if (f.max !== null) sp.set("max", String(f.max));
  if (f.category) {
    for (const key of Object.keys(f.specs).sort()) {
      const values = f.specs[key];
      if (values?.length) sp.set(SPEC_PREFIX + key, values.join(LIST_SEP));
    }
  }
  if (f.inStockOnly) sp.set("stock", "1");
  if (f.sort !== DEFAULT_SORT) sp.set("sort", f.sort);
  return sp;
}

export function filtersToQueryString(f: Filters): string {
  const s = buildSearchParams(f).toString();
  return s ? `?${s}` : "";
}

/* ------------------------------------------------------------------ */
/* Matching                                                            */
/* ------------------------------------------------------------------ */

type Predicates = Record<string, (p: Product) => boolean>;

/** One predicate per filter dimension, so facets can exclude their own. */
function buildPredicates(f: Filters): Predicates {
  const preds: Predicates = {};

  if (f.q) {
    /*
     * The text query is answered by `lib/search.ts`, not by substring matching
     * here — it has to survive Georgian input, Latin input and typos. The call
     * is memoized on the query, which matters because this function runs once
     * for the results and once more per facet dimension.
     */
    const ids = searchIds(f.q);
    preds.q = (p) => ids.has(p.id);
  }
  if (f.category) preds.category = (p) => p.category === f.category;
  if (f.subcategories.length)
    preds.subcategory = (p) => f.subcategories.includes(p.subcategory);
  if (f.brands.length) preds.brand = (p) => f.brands.includes(p.brand);
  if (f.min !== null || f.max !== null)
    preds.price = (p) =>
      (f.min === null || p.promo_price >= f.min) &&
      (f.max === null || p.promo_price <= f.max);
  if (f.inStockOnly) preds.stock = (p) => p.stock;

  for (const [key, values] of Object.entries(f.specs)) {
    if (!values.length) continue;
    preds[`spec:${key}`] = (p) => values.includes(p.specs[key]);
  }
  return preds;
}

function applyPredicates(
  items: Product[],
  preds: Predicates,
  except: string[] = [],
): Product[] {
  const active = Object.entries(preds).filter(([key]) => !except.includes(key));
  if (!active.length) return items;
  return items.filter((p) => active.every(([, fn]) => fn(p)));
}

const comparators: Record<Sort, (a: Product, b: Product) => number> = {
  // Ties break by discount, so equally-priced products still lead with the
  // better offer instead of falling back to whatever order the file happens
  // to be in.
  "price-asc": (a, b) =>
    a.promo_price - b.promo_price ||
    discountPercent(b.old_price, b.promo_price) -
      discountPercent(a.old_price, a.promo_price),
  "price-desc": (a, b) =>
    b.promo_price - a.promo_price ||
    discountPercent(b.old_price, b.promo_price) -
      discountPercent(a.old_price, a.promo_price),
};

export function sortProducts(items: Product[], sort: Sort): Product[] {
  return [...items].sort(comparators[sort] ?? comparators[DEFAULT_SORT]);
}

export function applyFilters(all: Product[], f: Filters): Product[] {
  return sortProducts(applyPredicates(all, buildPredicates(f)), f.sort);
}

/* ------------------------------------------------------------------ */
/* Facets                                                              */
/* ------------------------------------------------------------------ */

export type FacetOption = { value: string; count: number };
export type SpecFacet = { key: string; options: FacetOption[] };

export type Facets = {
  categories: Record<string, number>;
  subcategories: Record<string, number>;
  brands: FacetOption[];
  specs: SpecFacet[];
  /** promo_price bounds of everything matching the other filters */
  priceBounds: { min: number; max: number };
};

function countBy(items: Product[], pick: (p: Product) => string | undefined) {
  const out: Record<string, number> = {};
  for (const p of items) {
    const key = pick(p);
    if (key === undefined) continue;
    out[key] = (out[key] ?? 0) + 1;
  }
  return out;
}

/**
 * Counts shown next to each option are computed with that option's own
 * dimension excluded — the standard e-commerce behaviour, so ticking a second
 * brand never shows "0" next to a brand that clearly has results.
 */
export function computeFacets(all: Product[], f: Filters): Facets {
  const preds = buildPredicates(f);
  // Spec dimensions narrow to the subcategory only when exactly one is picked;
  // with several selected there is no single scope whose attributes apply.
  const specKeys = specKeysForCategory(
    f.category,
    f.subcategories.length === 1 ? f.subcategories[0] : null,
  );
  const specPredKeys = Object.keys(preds).filter((k) => k.startsWith("spec:"));

  const forCategories = applyPredicates(all, preds, [
    "category",
    "subcategory",
    ...specPredKeys,
  ]);
  const forSubcategories = applyPredicates(all, preds, [
    "subcategory",
    ...specPredKeys,
  ]);
  const forBrands = applyPredicates(all, preds, ["brand"]);
  const forPrice = applyPredicates(all, preds, ["price"]);

  const brandCounts = countBy(forBrands, (p) => p.brand);
  const brands: FacetOption[] = Object.keys(brandCounts)
    .sort((a, b) => a.localeCompare(b))
    .map((value) => ({ value, count: brandCounts[value] }));

  const specs: SpecFacet[] = specKeys
    .map((key) => {
      const scope = applyPredicates(all, preds, [`spec:${key}`]);
      const counts = countBy(scope, (p) => p.specs[key]);
      const options = Object.keys(counts)
        .sort((a, b) =>
          a.localeCompare(b, "ka", { numeric: true, sensitivity: "base" }),
        )
        .map((value) => ({ value, count: counts[value] }));
      return { key, options };
    })
    .filter((facet) => facet.options.length > 0);

  const prices = forPrice.map((p) => p.promo_price);
  const priceBounds = prices.length
    ? { min: Math.floor(Math.min(...prices)), max: Math.ceil(Math.max(...prices)) }
    : { min: 0, max: 0 };

  return {
    categories: countBy(forCategories, (p) => p.category),
    subcategories: countBy(forSubcategories, (p) => p.subcategory),
    brands,
    specs,
    priceBounds,
  };
}

/* ------------------------------------------------------------------ */
/* Active chips                                                        */
/* ------------------------------------------------------------------ */

export type ActiveChip = {
  /** stable key for React */
  id: string;
  label: string;
  /** filters with this one entry removed */
  next: Filters;
};

export function activeFilterCount(f: Filters): number {
  return (
    (f.q ? 1 : 0) +
    (f.category ? 1 : 0) +
    f.subcategories.length +
    f.brands.length +
    (f.min !== null || f.max !== null ? 1 : 0) +
    Object.values(f.specs).reduce((n, v) => n + v.length, 0) +
    (f.inStockOnly ? 1 : 0)
  );
}

export function removeSpecValue(
  f: Filters,
  key: string,
  value: string,
): Filters {
  const remaining = (f.specs[key] ?? []).filter((v) => v !== value);
  const specs = { ...f.specs };
  if (remaining.length) specs[key] = remaining;
  else delete specs[key];
  return { ...f, specs };
}
