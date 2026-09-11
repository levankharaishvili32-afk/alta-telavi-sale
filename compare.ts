import schemaJson from "@/data/spec-schema.json";
import { products } from "./catalog";
import type { Product } from "./types";

export const MAX_COMPARE = 4;
export const MIN_COMPARE = 2;
export const COMPARE_KEY = "alta-gldani-compare";

type Schema = {
  aliases: Record<string, string>;
  categories: Record<string, { label: string; products: number; keys: string[] }>;
};

const SCHEMA = schemaJson as unknown as Schema;

/**
 * Comparison is scoped to `category/subcategory`, not to the top-level
 * category. Putting a mouse next to a printer is technically "the same
 * category" here and useless in practice — they share no attribute, so every
 * row would be an em dash.
 */
export const scopeOf = (p: Product) => `${p.category}/${p.subcategory}`;

export function scopeLabel(scope: string): string {
  return SCHEMA.categories[scope]?.label ?? scope;
}

/** Ordered canonical keys for a scope, straight from the hand-tunable schema. */
export function specKeysForScope(scope: string): string[] {
  return SCHEMA.categories[scope]?.keys ?? [];
}

/**
 * Resolve `?ids=` into products, keeping the URL's order and dropping anything
 * unknown, duplicated, over the cap, or from a different scope than the first
 * valid id. A shared link that has gone stale degrades to the products that
 * still exist rather than to an error.
 */
export function resolveCompare(raw: string | null): {
  items: Product[];
  scope: string | null;
  dropped: number;
} {
  const ids = (raw ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const byId = new Map(products.map((p) => [p.id, p]));
  const seen = new Set<string>();
  const items: Product[] = [];
  let scope: string | null = null;
  let dropped = 0;

  for (const id of ids) {
    const product = byId.get(id);
    if (!product || seen.has(id)) {
      dropped += 1;
      continue;
    }
    const productScope = scopeOf(product);
    if (scope === null) scope = productScope;
    if (productScope !== scope || items.length >= MAX_COMPARE) {
      dropped += 1;
      continue;
    }
    seen.add(id);
    items.push(product);
  }

  return { items, scope: items.length ? scope : null, dropped };
}

export const compareHref = (ids: string[]) =>
  `/compare?ids=${ids.map(encodeURIComponent).join(",")}`;
