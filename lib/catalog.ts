import categoriesJson from "@/data/categories.json";
import productsJson from "@/data/products.json";
import filterableSpecsJson from "@/data/filterable-specs.json";
import type { Category, Product } from "./types";
import { discountPercent } from "./format";

// JSON module inference widens each object's `specs` into a distinct literal
// type, so the cast goes through `unknown`. The shape is validated by
// `npm run validate:data`.
export const categories = categoriesJson as unknown as Category[];
export const products = productsJson as unknown as Product[];

/**
 * Spec keys that should be offered as filters, keyed by `category` and by
 * `category/subcategory`. The *values* are always derived from the data, never
 * hardcoded — this only decides which spec dimensions are worth exposing (and
 * in what order). A scope missing from this map falls back to the heuristic
 * below.
 */
export const FILTERABLE_SPECS = filterableSpecsJson as Record<string, string[]>;

/**
 * Whether any category has spec dimensions to filter on. Feeds without
 * structured attributes (colour, size, capacity…) produce none, and the UI
 * shouldn't promise a filter that will never appear.
 */
export const hasSpecFilters = Object.values(FILTERABLE_SPECS).some(
  (keys) => keys.length > 0,
);

/**
 * Fallback for scopes with no explicit config: any spec key present on at least
 * 60% of the scope's products, having 2–8 distinct values, whose values are
 * comma-free (the URL encoding is comma-separated) and which actually groups
 * products rather than identifying them one by one.
 *
 * Kept deliberately in step with `buildFilterableSpecs` in
 * `scripts/scrape-alta.mjs`, which precomputes the same thing at import time.
 */
function inferSpecKeys(scoped: Product[]): string[] {
  const values = new Map<string, Set<string>>();
  const seen = new Map<string, number>();
  for (const p of scoped) {
    for (const [key, value] of Object.entries(p.specs)) {
      if (!values.has(key)) values.set(key, new Set());
      values.get(key)!.add(value);
      seen.set(key, (seen.get(key) ?? 0) + 1);
    }
  }
  return [...values.entries()]
    .filter(([key, set]) => {
      const n = seen.get(key) ?? 0;
      if (set.size < 2 || set.size > 8) return false;
      if (n < scoped.length * 0.6) return false;
      if (set.size > n / 1.5) return false;
      return ![...set].some((v) => v.includes(","));
    })
    .map(([key]) => key)
    .sort((a, b) => a.localeCompare(b, "ka"));
}

/**
 * Spec dimensions available for filtering, given the selected category and —
 * when the shopper has narrowed to one — subcategory. The narrower scope wins:
 * a group as broad as "IT ტექნიკა" has almost no attribute in common across
 * mice, monitors and printers, so its useful dimensions only exist per
 * subcategory.
 */
export function specKeysForCategory(
  categoryId: string | null,
  subcategoryId: string | null = null,
): string[] {
  if (!categoryId) return [];

  if (subcategoryId) {
    const scoped = FILTERABLE_SPECS[`${categoryId}/${subcategoryId}`];
    if (scoped?.length) return scoped;
    if (!scoped) {
      const inferred = inferSpecKeys(
        products.filter(
          (p) => p.category === categoryId && p.subcategory === subcategoryId,
        ),
      );
      if (inferred.length) return inferred;
    }
  }

  const configured = FILTERABLE_SPECS[categoryId];
  if (configured) return configured;
  return inferSpecKeys(products.filter((p) => p.category === categoryId));
}

export function getCategory(id: string | null): Category | undefined {
  return categories.find((c) => c.id === id);
}

export function categoryLabel(id: string): string {
  return getCategory(id)?.label ?? id;
}

export function subcategoryLabel(categoryId: string, subId: string): string {
  return (
    getCategory(categoryId)?.subcategories.find((s) => s.id === subId)?.label ??
    subId
  );
}

export function getProduct(id: string): Product | undefined {
  return products.find((p) => p.id === id);
}

/**
 * The deepest discounts in the catalog.
 *
 * Used wherever a search comes back empty. A blank "nothing found" is a dead
 * end; the four best offers on the site are at least a reason to keep looking,
 * and on a discount campaign they are the most likely thing to interest
 * somebody whose exact search missed.
 */
export function deepestDiscounts(limit = 4): Product[] {
  return [...products]
    .sort(
      (a, b) =>
        discountPercent(b.old_price, b.promo_price) -
          discountPercent(a.old_price, a.promo_price) ||
        b.old_price - b.promo_price - (a.old_price - a.promo_price),
    )
    .slice(0, limit);
}

export function relatedProducts(product: Product, limit = 4): Product[] {
  const pool = products.filter(
    (p) => p.id !== product.id && p.category === product.category,
  );
  const sameSub = pool.filter((p) => p.subcategory === product.subcategory);
  const rest = pool.filter((p) => p.subcategory !== product.subcategory);
  return [...sameSub, ...rest].slice(0, limit);
}
