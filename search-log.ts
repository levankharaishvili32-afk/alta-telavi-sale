/**
 * What people actually type into the search box.
 *
 * Stored in localStorage under `search_queries` as a newest-last list of
 * `{ q, n, at }` — the query as typed, how many products came back, and when.
 * Read it in the browser console with `window.__getSearchQueries()`, or
 * `window.__getSearchQueries(0)` for just the ones that found nothing.
 *
 * The zero-result entries are the point. Character transliteration cannot be
 * taught that ელჯი means LG; only `data/search-aliases.json` can, and this list
 * is what says which line to add to it next.
 *
 * Client-side only, one visitor's own history, never sent anywhere.
 */

export const SEARCH_QUERIES_KEY = "search_queries";

/** Enough to see a pattern, small enough to never trouble the 5MB quota. */
const MAX_ENTRIES = 300;

export type SearchLogEntry = {
  /** the query exactly as typed, before any normalization */
  q: string;
  /** how many products it matched */
  n: number;
  /** epoch milliseconds */
  at: number;
};

export function readSearchQueries(): SearchLogEntry[] {
  try {
    const raw = window.localStorage.getItem(SEARCH_QUERIES_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (e): e is SearchLogEntry =>
        !!e &&
        typeof e === "object" &&
        typeof (e as SearchLogEntry).q === "string" &&
        typeof (e as SearchLogEntry).n === "number",
    );
  } catch {
    return [];
  }
}

/**
 * Records one search.
 *
 * Called after the debounce, so `sams` → `samsu` → `samsun` → `samsung` logs
 * once, not four times. A repeat of the query already at the end of the list is
 * folded into it (only the timestamp moves), which keeps a shopper flipping
 * between two filters from filling the log with the same string.
 */
export function recordSearch(query: string, resultCount: number) {
  const q = query.trim();
  if (q.length < 2) return;
  try {
    const entries = readSearchQueries();
    const last = entries[entries.length - 1];
    if (last && last.q === q) {
      last.n = resultCount;
      last.at = Date.now();
    } else {
      entries.push({ q, n: resultCount, at: Date.now() });
    }
    window.localStorage.setItem(
      SEARCH_QUERIES_KEY,
      JSON.stringify(entries.slice(-MAX_ENTRIES)),
    );
  } catch {
    // Best-effort. A full or disabled localStorage must not break search.
  }
}

/**
 * Exposes the log to the console. `__getSearchQueries()` returns everything;
 * pass a number to see only the queries that returned exactly that many
 * results — `__getSearchQueries(0)` is the alias to-do list.
 */
export function installSearchQueriesHelper() {
  if (typeof window === "undefined") return;
  (window as unknown as Record<string, unknown>).__getSearchQueries = (
    n?: number,
  ) => {
    const entries = readSearchQueries();
    return n === undefined ? entries : entries.filter((e) => e.n === n);
  };
}
