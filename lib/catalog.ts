import categoriesJson from "@/data/categories.json";
import productsJson from "@/data/products.json";
import filterableSpecsJson from "@/data/filterable-specs.json";
import type { Category, Product } from "./types";

// JSON module inference widens each object's `specs` into a distinct literal
// type, so the cast goes through `unknown`. The shape is validated by
// `npm run validate:data`.
export const categories = categoriesJson as unknown as Category[];
export const products = productsJson as unknown as Product[];

/**
 * Spec keys that should be offered as filters, per category.
 * The *values* are always derived from the data, never hardcoded — this only
 * decides which spec dimensions are worth exposing (and in what order).
 * A category missing from this map falls back to the heuristic below.
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
 * Fallback for categories with no explicit config: any spec key present on at
 * least 60% of the category's products and having 2–8 distinct values.
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
    .filter(
      ([key, set]) =>
        set.size >= 2 &&
        set.size <= 8 &&
        (seen.get(key) ?? 0) >= scoped.length * 0.6,
    )
    .map(([key]) => key)
    .sort((a, b) => a.localeCompare(b, "ka"));
}

/** Spec dimensions available for filtering, given the selected category. */
export function specKeysForCategory(categoryId: string | null): string[] {
  if (!categoryId) return [];
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

export function relatedProducts(product: Product, limit = 4): Product[] {
  const pool = products.filter(
    (p) => p.id !== product.id && p.category === product.category,
  );
  const sameSub = pool.filter((p) => p.subcategory === product.subcategory);
  const rest = pool.filter((p) => p.subcategory !== product.subcategory);
  return [...sameSub, ...rest].slice(0, limit);
}
