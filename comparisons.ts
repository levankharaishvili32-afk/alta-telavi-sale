import comparisonsJson from "@/data/comparisons.json";
import { getProduct } from "./catalog";
import type { Product } from "./types";

export type SuggestionKind = "similar" | "popular";

type StoredSuggestion = {
  id: string;
  kind: SuggestionKind;
  score: number;
  why?: Record<string, number>;
};

export type Suggestion = {
  product: Product;
  kind: SuggestionKind;
  score: number;
};

const SUGGESTIONS = comparisonsJson as unknown as Record<
  string,
  StoredSuggestion[]
>;

/**
 * Precomputed suggestions for a product, minus anything already picked.
 *
 * `scripts/build-comparisons.mjs` stores more than the three shown so the
 * exclusion below cannot empty the list. `kind` distinguishes a genuinely
 * similar product from a fallback filled in by discount depth — the UI labels
 * the two differently rather than pretending they are the same thing.
 */
export function suggestionsFor(
  productId: string,
  exclude: string[] = [],
  limit = 3,
): Suggestion[] {
  const skip = new Set([productId, ...exclude]);
  const out: Suggestion[] = [];

  for (const entry of SUGGESTIONS[productId] ?? []) {
    if (skip.has(entry.id)) continue;
    const product = getProduct(entry.id);
    if (!product) continue;
    out.push({ product, kind: entry.kind, score: entry.score });
    if (out.length >= limit) break;
  }

  return out;
}
