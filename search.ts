import indexJson from "@/data/search-index.json";
import { createSearchEngine } from "./search-engine.js";
import { toGeorgianMapped, toLatinMapped, toOriginalRanges } from "./translit";
import type { Product } from "./types";

/**
 * The app's front door to search.
 *
 * The matching itself lives in `lib/search-engine.js` — framework-free, so the
 * exact code that runs here can also be driven from bare Node while tuning.
 * What this file adds is the parts that only make sense inside the app: types,
 * memoization across a render, joining ids back to products, and translating
 * match positions into offsets in the title as it will actually be displayed.
 *
 * Every search box on the site comes through `searchProducts`. A second
 * implementation is how the catalog and the comparison picker would start
 * disagreeing about what `სამსუნგი` means.
 */

type Fields = { title: string; brand: string; category: string };
type IndexEntry = {
  id: string;
  title: string;
  brand: string;
  category: string;
  latin: Fields;
  ka: Fields;
};

type Lane = "latin" | "ka";
type Match = { key: string; indices: Array<[number, number]> };

export type SearchHit = {
  id: string;
  /** 0 is a certainty, 1 is a coincidence. Lower is better. */
  score: number;
  /** which folded form produced the match — needed to map offsets back */
  lane: Lane;
  matches: Match[];
};

export type SearchOutcome = {
  /**
   * `code` — the query was a product id; go straight there.
   * `text` — an ordinary search. No hits means nothing matched.
   * `empty` — nothing was typed. Not the same as finding nothing.
   */
  kind: "code" | "text" | "empty";
  /** the product to jump to, on a `code` outcome */
  codeId?: string;
  /** best first */
  hits: SearchHit[];
  ids: Set<string>;
  byId: Map<string, SearchHit>;
};

const index = indexJson as unknown as {
  entries: IndexEntry[];
  aliases: Array<{ term: string; spellings: string[] }>;
};

const engine = createSearchEngine(index);

const titleById = new Map(index.entries.map((e) => [e.id, e.title]));

const EMPTY: SearchOutcome = {
  kind: "empty",
  hits: [],
  ids: new Set(),
  byId: new Map(),
};

/**
 * Memoized on the raw query. Within one render the facet pass, the result pass
 * and the count all ask the same question; recomputing three times would be
 * three times the work for the same answer.
 */
let memo: { query: string; outcome: SearchOutcome } | null = null;

export function searchProducts(raw: string): SearchOutcome {
  const query = (raw ?? "").trim();
  if (!query) return EMPTY;
  if (memo?.query === query) return memo.outcome;

  const result = engine.search(query) as {
    kind: "code" | "text" | "empty";
    codeId?: string;
    hits: SearchHit[];
  };
  const outcome: SearchOutcome = {
    ...result,
    ids: new Set(result.hits.map((h) => h.id)),
    byId: new Map(result.hits.map((h) => [h.id, h])),
  };
  memo = { query, outcome };
  return outcome;
}

/** Just the matching ids — what the catalog's filter predicate needs. */
export function searchIds(query: string): Set<string> {
  return searchProducts(query).ids;
}

/**
 * Products for a query, best match first, restricted to `pool`.
 *
 * The pool is applied after ranking rather than before, so the comparison
 * picker narrowing to one category cannot change the order of what survives.
 */
export function searchIn(
  query: string,
  pool: readonly Product[],
  limit = Number.POSITIVE_INFINITY,
): Product[] {
  const outcome = searchProducts(query);
  if (outcome.kind === "empty") return [];
  const allowed = new Map(pool.map((p) => [p.id, p]));
  const out: Product[] = [];
  for (const hit of outcome.hits) {
    const product = allowed.get(hit.id);
    if (!product) continue;
    out.push(product);
    if (out.length >= limit) break;
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Highlighting                                                        */
/* ------------------------------------------------------------------ */

export type Range = [start: number, end: number];

/**
 * Where the match landed in the title *as displayed*.
 *
 * Positions come back from the engine against the folded text — `Samsung
 * Odyssey G4` is indexed as `samsung odyssey g 4`, four characters longer than
 * what the shopper sees. Every folding stage in `translit.js` carries a source
 * offset per character, so the positions translate back exactly instead of
 * being approximated.
 *
 * Cached, and computed only for the results actually painted: a page of cards,
 * not the whole result set.
 */
const rangeCache = new Map<string, Range[]>();

export function titleRanges(hit: SearchHit): Range[] {
  const title = titleById.get(hit.id);
  if (!title) return [];

  const indices = hit.matches
    .filter((m) => m.key === "title")
    .flatMap((m) => m.indices);
  if (!indices.length) return [];

  const key = `${hit.lane}|${hit.id}|${indices.map((i) => i.join("-")).join(",")}`;
  const cached = rangeCache.get(key);
  if (cached) return cached;

  const mapped =
    hit.lane === "ka" ? toGeorgianMapped(title) : toLatinMapped(title);
  const ranges = toOriginalRanges(mapped, indices, title.length) as Range[];
  rangeCache.set(key, ranges);
  return ranges;
}

/** Match positions for one product of a result set, or none if it did not match. */
export function rangesFor(outcome: SearchOutcome, id: string): Range[] {
  const hit = outcome.byId.get(id);
  return hit ? titleRanges(hit) : [];
}
