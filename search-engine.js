import Fuse from "fuse.js";

import {
  georgianCandidate,
  hasGeorgian,
  latinCandidates,
  toGeorgian,
  toLatin,
} from "./translit.js";

/**
 * The search engine itself: index in, ranked ids out.
 *
 * Plain JavaScript and framework-free on purpose. It takes the parsed
 * `data/search-index.json` as an argument and imports nothing from the app, so
 * the exact code the browser runs can also be driven from bare Node — which is
 * how the thresholds below were chosen and how they can be re-checked. A
 * search engine tuned against a re-implementation of itself is tuned against
 * nothing.
 *
 * `lib/search.ts` wraps this with types, the product join and highlighting.
 *
 * Three passes, in descending order of confidence:
 *
 *   code   — a 5–7 digit query that is exactly a product id. Nothing else runs.
 *   exact  — every word of the query occurs in the folded text. This is what
 *            answers ordinary queries: precise, and unlike fuzzy matching it
 *            handles several words at once, because it checks them one at a
 *            time instead of looking for the whole phrase in a row.
 *   fuzzy  — Fuse.js, for the typos. It only ever adds to the exact pass, and
 *            everything it returns is ranked below it.
 *
 * Each pass runs in two lanes — text folded to Latin, and text folded to a
 * reduced Georgian alphabet — and in each lane both as typed and with
 * `data/search-aliases.json` applied. A product keeps its best score.
 */

/* ------------------------------------------------------------------ */
/* Tuning                                                              */
/* ------------------------------------------------------------------ */

/**
 * Fuse's per-field match ceiling: 0 demands an exact match, 1 accepts
 * anything. At 0.35 `smasung` and `samsng` both still find Samsung; by 0.45 a
 * three-letter query matches most of the catalog.
 */
const THRESHOLD = 0.35;

/**
 * The Georgian lane runs tighter. Its entries are Latin product titles pushed
 * through a lossy alphabet — ტ and თ are already merged — so on those titles it
 * is strictly more permissive than the Latin lane and would be the one letting
 * strangers in. It earns its keep on the category labels, the only real
 * Georgian text in the corpus.
 */
const THRESHOLD_KA = 0.28;

/**
 * Composite-score ceiling, applied after Fuse.
 *
 * Fuse's `threshold` gates each field on its own; the score it reports is the
 * weighted product across the fields that matched, and that number is what
 * actually separates a result from a coincidence. Measured on this catalog:
 * `smasung` finds Samsung at 0.37 and `samsng` at 0.24, while the best
 * accidental matches — `iphone` inside `microphone`, `samsng` inside
 * `gaming` — sit at 0.41 and above.
 */
const MAX_SCORE = 0.4;

/**
 * Field-length normalization off.
 *
 * With it on, Fuse discounts a match by how long the field is, so an exact hit
 * in a long title scores *worse* than a sloppy hit in a short one — `iphone`
 * inside `Marvo Blast 50 streaming microphone` scored 0.69 against a genuine
 * `smasung` match at 0.53, leaving no cut that separated them. Off, the same
 * pair is 0.41 against 0.37.
 */
const IGNORE_FIELD_NORM = true;

/**
 * Weighted by which field decides whether a result is the right one: the title
 * carries the model, the brand is what most queries actually are, and the
 * category is the tiebreaker that makes `ტელევიზორი` work at all.
 */
const KEYS = [
  { name: "title", weight: 0.5 },
  { name: "brand", weight: 0.3 },
  { name: "category", weight: 0.2 },
];

/**
 * Scores for the exact pass, by the field the word was found in. All well
 * below anything Fuse returns, so an exact match always outranks a fuzzy one.
 */
const EXACT_SCORE = { title: 0, brand: 0.002, category: 0.004 };
/** Added when a word matched inside another word rather than at its start. */
const INFIX_PENALTY = 0.005;

/** Below this, a word only counts at the start of a word in the text. */
const MIN_INFIX_LENGTH = 3;
/** Below this, fuzzy matching is noise — every short string is near everything. */
const MIN_FUZZY_LENGTH = 3;

/** Product codes: the barCode from the CSV, as printed on the shelf label. */
const CODE_PATTERN = /^\d{5,7}$/;

const FIELDS = /** @type {const} */ (["title", "brand", "category"]);

/* ------------------------------------------------------------------ */
/* Engine                                                              */
/* ------------------------------------------------------------------ */

/**
 * @typedef {{ title: string, brand: string, category: string }} Fields
 * @typedef {{ id: string, title: string, brand: string, category: string,
 *             latin: Fields, ka: Fields }} IndexEntry
 * @typedef {"latin" | "ka"} Lane
 * @typedef {{ key: string, indices: Array<[number, number]> }} Match
 * @typedef {{ id: string, score: number, lane: Lane, matches: Match[] }} Hit
 * @typedef {{ kind: "code" | "text" | "empty", codeId?: string, hits: Hit[] }} Outcome
 */

/**
 * @param {{ entries: IndexEntry[], aliases: Array<{term: string, spellings: string[]}> }} index
 */
export function createSearchEngine(index) {
  const entries = index.entries;
  const ids = new Set(entries.map((e) => e.id));

  /*
   * Which fields the Georgian lane is allowed to search — the ones that are
   * actually written in Georgian somewhere in the catalog.
   *
   * Derived from the data rather than hardcoded, and today it comes out as
   * just the category label, because every product title and brand in this
   * feed is Latin. Letting the lane loose on those anyway is not merely
   * redundant, it invents matches: `two` folds to `თვო`, so a Latin query for
   * `tv` found a pair of Genius speakers. The Latin lane already covers Latin
   * text, including the letter collisions, since ტ and თ both come out as `t`
   * there too.
   *
   * The day a Georgian-titled product enters the feed, `title` joins the list
   * on the next `npm run search-index` with nothing to change here.
   */
  const KA_FIELDS = FIELDS.filter((field) =>
    entries.some((entry) => hasGeorgian(entry[field] ?? "")),
  );

  /* --- aliases -------------------------------------------------- */

  /** folded spelling -> the canonical term, folded for each lane */
  const aliasBySpelling = new Map();
  /** every spelling, longest first, for the prefix pass */
  const aliasSpellings = [];

  for (const { term, spellings } of index.aliases ?? []) {
    const folded = { latin: toLatin(term), ka: toGeorgian(term) };
    for (const spelling of spellings)
      if (spelling && !aliasBySpelling.has(spelling)) {
        aliasBySpelling.set(spelling, folded);
        aliasSpellings.push(spelling);
      }
  }
  aliasSpellings.sort((a, b) => b.length - a.length);

  /**
   * Rewrites the words of a folded query through the alias table. Exact match
   * first; failing that, a word of four characters or more that begins a known
   * spelling counts, so someone who stops typing at `სამსუნ` still arrives.
   *
   * @returns {string | null} null when nothing matched, so the caller can skip
   *   a redundant second pass over the same string.
   */
  function expandAliases(query, lane) {
    const words = query.split(" ").filter(Boolean);
    let changed = false;
    const out = words.map((word) => {
      const exact = aliasBySpelling.get(word);
      if (exact) {
        changed = true;
        return exact[lane];
      }
      if (word.length >= 4) {
        const prefix = aliasSpellings.find((s) => s.startsWith(word));
        if (prefix) {
          changed = true;
          return aliasBySpelling.get(prefix)[lane];
        }
      }
      return word;
    });
    return changed ? out.join(" ") : null;
  }

  /* --- fuzzy indexes -------------------------------------------- */

  /**
   * Built on first use. Nothing on a cold product page ever searches, and two
   * Fuse indexes over a few hundred products is not work worth doing before
   * anybody has typed anything.
   *
   * @type {Map<Lane, Fuse<any>>}
   */
  const fuses = new Map();

  function fuseFor(lane) {
    let fuse = fuses.get(lane);
    if (!fuse) {
      const fields = lane === "ka" ? KA_FIELDS : FIELDS;
      fuse = new Fuse(
        entries.map((e) => ({ id: e.id, ...e[lane] })),
        {
          keys: KEYS.filter((k) => fields.includes(k.name)),
          includeScore: true,
          includeMatches: true,
          // The deciding word is rarely the first one — "Samsung Curved
          // Odyssey G5 27" hides the size thirty characters in.
          ignoreLocation: true,
          ignoreFieldNorm: IGNORE_FIELD_NORM,
          findAllMatches: true,
          minMatchCharLength: 2,
          threshold: lane === "ka" ? THRESHOLD_KA : THRESHOLD,
        },
      );
      fuses.set(lane, fuse);
    }
    return fuse;
  }

  /* --- passes ---------------------------------------------------- */

  /** Keeps the best-scoring hit per product across every pass and lane. */
  function keep(best, hit) {
    const existing = best.get(hit.id);
    if (existing && existing.score <= hit.score) return;
    best.set(hit.id, hit);
  }

  /**
   * Every word of the query must occur somewhere in the entry. Words are
   * matched at the start of a word in the text; from three characters up they
   * may also match inside one, which costs a little score — that is what lets
   * `book` find `ZenBook` without letting `lg` find `algorithm`.
   */
  function exactPass(query, lane, best) {
    const words = query.split(" ").filter(Boolean);
    if (!words.length) return;

    const searchable = lane === "ka" ? KA_FIELDS : FIELDS;
    if (!searchable.length) return;

    // Hoisted out of the entry loop: this runs a few hundred times per
    // candidate and the padded form would otherwise be rebuilt on each.
    const needles = words.map((word) => ({
      word,
      spaced: ` ${word}`,
      infixable: word.length >= MIN_INFIX_LENGTH,
    }));

    for (const entry of entries) {
      const fields = entry[lane];
      let score = 0;
      /** @type {Match[]} */
      const matches = [];
      let ok = true;

      for (const needle of needles) {
        let bestForWord = null;
        for (const field of searchable) {
          const text = fields[field];

          let start;
          let penalty = 0;
          if (text.startsWith(needle.word)) {
            start = 0;
          } else {
            const spaced = text.indexOf(needle.spaced);
            if (spaced >= 0) {
              start = spaced + 1;
            } else {
              const inside = needle.infixable ? text.indexOf(needle.word) : -1;
              if (inside < 0) continue;
              start = inside;
              penalty = INFIX_PENALTY;
            }
          }

          const wordScore = EXACT_SCORE[field] + penalty;
          if (bestForWord === null || wordScore < bestForWord.score)
            bestForWord = { score: wordScore, field, start };
        }
        if (!bestForWord) {
          ok = false;
          break;
        }
        // The weakest field any word had to fall back to sets the score, so a
        // product carrying every word in its title outranks one that needed
        // its category label to cover half the query.
        score = Math.max(score, bestForWord.score);
        if (bestForWord.field === "title")
          matches.push({
            key: "title",
            indices: [
              [bestForWord.start, bestForWord.start + needle.word.length - 1],
            ],
          });
      }

      if (ok) keep(best, { id: entry.id, score, lane, matches });
    }
  }

  /**
   * Fuse, with everything above `MAX_SCORE` treated as a coincidence.
   *
   * @returns {Map<string, Hit>} this query's hits, so a caller doing several
   *   words can intersect them rather than union them.
   */
  function fuzzyPass(query, lane) {
    /** @type {Map<string, Hit>} */
    const found = new Map();
    if (query.length < MIN_FUZZY_LENGTH) return found;
    for (const result of fuseFor(lane).search(query)) {
      const score = result.score ?? 1;
      if (score > MAX_SCORE) continue;
      const hit = {
        id: result.item.id,
        // Kept clear of the exact pass's band, so an exact match always wins
        // however good the fuzzy one looks.
        score: 0.05 + score,
        lane,
        matches: (result.matches ?? []).map((m) => ({
          key: String(m.key),
          indices: m.indices.map(([a, b]) => [a, b]),
        })),
      };
      const existing = found.get(hit.id);
      if (!existing || existing.score > hit.score) found.set(hit.id, hit);
    }
    return found;
  }

  /**
   * Fuzzy matching for one candidate string.
   *
   * Fuse looks for the query as one run of characters, which is fine for a
   * misspelled word and hopeless for a misspelled phrase: `smasung galaxy`
   * never appears contiguously in `Samsung S948B Galaxy S26 Ultra`. So a
   * multi-word query that finds nothing whole is retried word by word and the
   * results intersected — the same "all of these words" rule the exact pass
   * uses, one step blurrier.
   */
  function fuzzyCandidate(query, lane, best) {
    for (const hit of fuzzyPass(query, lane).values()) keep(best, hit);

    const words = query.split(" ").filter((w) => w.length >= MIN_FUZZY_LENGTH);
    if (words.length < 2) return;

    /** @type {Map<string, Hit> | null} */
    let intersection = null;
    for (const word of words) {
      const found = fuzzyPass(word, lane);
      if (!found.size) return;
      if (intersection === null) {
        intersection = found;
        continue;
      }
      for (const id of [...intersection.keys()])
        if (!found.has(id)) intersection.delete(id);
      if (!intersection.size) return;
    }
    if (intersection) for (const hit of intersection.values()) keep(best, hit);
  }

  /* --- entry point ----------------------------------------------- */

  /**
   * @param {string} raw
   * @returns {Outcome}
   */
  function search(raw) {
    const query = (raw ?? "").trim();
    if (!query) return { kind: "empty", hits: [] };

    if (CODE_PATTERN.test(query) && ids.has(query))
      return {
        kind: "code",
        codeId: query,
        hits: [{ id: query, score: 0, lane: "latin", matches: [] }],
      };

    /** @type {Map<string, Hit>} */
    const best = new Map();

    /** @type {Array<[string, Lane]>} */
    const candidates = [];
    for (const candidate of latinCandidates(query))
      candidates.push([candidate, "latin"]);
    candidates.push([georgianCandidate(query), "ka"]);

    for (const [candidate, lane] of candidates.slice()) {
      const expanded = expandAliases(candidate, lane);
      if (expanded && expanded !== candidate) candidates.push([expanded, lane]);
    }

    for (const [candidate, lane] of candidates) {
      if (!candidate) continue;
      exactPass(candidate, lane, best);
    }
    // Only reach for fuzzy when being precise found nothing. It is a fallback
    // for typos, and running it alongside a good exact result only ever adds
    // near-misses to a list that was already right.
    if (best.size === 0)
      for (const [candidate, lane] of candidates) {
        if (!candidate) continue;
        fuzzyCandidate(candidate, lane, best);
      }

    const hits = [...best.values()].sort(
      (a, b) => a.score - b.score || a.id.localeCompare(b.id),
    );
    return { kind: "text", hits };
  }

  return { search };
}

export const SEARCH_TUNING = {
  THRESHOLD,
  THRESHOLD_KA,
  MAX_SCORE,
  KEYS,
  CODE_PATTERN,
};
