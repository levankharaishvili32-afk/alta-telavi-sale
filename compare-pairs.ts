/**
 * Records which products people actually end up comparing.
 *
 * Stored in localStorage under `compare_pairs` as
 * `{ "145224|157978": 3, … }`, where the key is the two ids sorted, so A→B and
 * B→A collapse into one bucket. Read it in the console with
 * `window.__getComparePairs()`.
 *
 * Nothing consumes this yet. When enough has accumulated, export it to
 * `data/compare-pairs.json` and raise `WEIGHTS.observed` in
 * `scripts/build-comparisons.mjs`, which already knows how to read it.
 */

export const PAIRS_KEY = "compare_pairs";

export type ComparePairs = Record<string, number>;

export function readComparePairs(): ComparePairs {
  try {
    const raw = window.localStorage.getItem(PAIRS_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : {};
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const out: ComparePairs = {};
    for (const [key, value] of Object.entries(parsed))
      if (typeof value === "number") out[key] = value;
    return out;
  } catch {
    return {};
  }
}

export const pairKey = (a: string, b: string) => [a, b].sort().join("|");

/**
 * Count every unordered pair in a completed comparison. Three products are
 * three pairs — each one is a real "these two were looked at together".
 */
export function recordComparison(ids: string[]) {
  const unique = [...new Set(ids)].filter(Boolean);
  if (unique.length < 2) return;
  try {
    const pairs = readComparePairs();
    for (let i = 0; i < unique.length; i += 1)
      for (let j = i + 1; j < unique.length; j += 1) {
        const key = pairKey(unique[i], unique[j]);
        pairs[key] = (pairs[key] ?? 0) + 1;
      }
    window.localStorage.setItem(PAIRS_KEY, JSON.stringify(pairs));
  } catch {
    // Logging is best-effort; it must never break the comparison itself.
  }
}

/** Exposes the log to the console. Called once, from the compare page. */
export function installComparePairsHelper() {
  if (typeof window === "undefined") return;
  (window as unknown as Record<string, unknown>).__getComparePairs = () =>
    readComparePairs();
}
