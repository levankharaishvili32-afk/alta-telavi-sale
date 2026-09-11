/**
 * Georgian ↔ Latin transliteration and the shared search normalizer.
 *
 * Plain JavaScript on purpose: this module is the single source of truth for
 * how text is folded before it is matched, and it has to run in two places —
 * `scripts/build-search-index.mjs` under bare Node, and the browser bundle.
 * A `.ts` file could not be imported by the build script without adding a
 * compile step, and two copies of a normalizer is how an index quietly stops
 * agreeing with the queries run against it.
 *
 * There are two matching "lanes", and every function here serves one of them:
 *
 *   Latin lane   — everything is folded to Latin. Product titles already are;
 *                  Georgian query text is transliterated into a handful of
 *                  candidates. `სამსუნგი` → `samsungi`, which Fuse then
 *                  reconciles with `samsung`.
 *   Georgian lane — everything is folded to a *reduced* Georgian alphabet in
 *                  which the letters people confuse are merged. Latin query
 *                  text is transliterated into exactly one candidate. This is
 *                  what lets `televizori` find `ტელევიზორები`.
 *
 * The asymmetry is deliberate. Going Georgian → Latin is ambiguous, so it
 * branches; going Latin → folded Georgian is not, because the folding has
 * already thrown away the distinctions that would have made it branch.
 */

/* ------------------------------------------------------------------ */
/* Character tables                                                     */
/* ------------------------------------------------------------------ */

/**
 * Georgian → Latin, by keyboard-layout position — which for most letters is
 * also what someone reaching for a Latin spelling would pick.
 *
 * Note the collisions: თ/ტ both `t`, ქ/კ both `k`, ც/წ both `ts`, ჩ/ჭ both
 * `ch`. They are correct. Nobody typing a brand name distinguishes them.
 *
 * @type {Record<string, string>}
 */
export const KA_TO_LAT = {
  ა: "a",
  ბ: "b",
  გ: "g",
  დ: "d",
  ე: "e",
  ვ: "v",
  ზ: "z",
  თ: "t",
  ი: "i",
  კ: "k",
  ლ: "l",
  მ: "m",
  ნ: "n",
  ო: "o",
  პ: "p",
  ჟ: "zh",
  რ: "r",
  ს: "s",
  ტ: "t",
  უ: "u",
  ფ: "f",
  ქ: "k",
  ღ: "gh",
  ყ: "q",
  შ: "sh",
  ჩ: "ch",
  ც: "ts",
  ძ: "dz",
  წ: "ts",
  ჭ: "ch",
  ხ: "kh",
  ჯ: "j",
  ჰ: "h",
};

/**
 * Second-choice Latin spellings, for letters where the first choice is a coin
 * flip. `ღვინო` is as likely to be typed `gvino` as `ghvino`; `ხიაომი` as
 * likely `hiaomi` as `khiaomi`.
 *
 * Only letters that genuinely have two live spellings belong here — every
 * entry multiplies the number of candidates a Georgian query produces.
 *
 * @type {Record<string, string>}
 */
export const KA_ALT_LAT = {
  ღ: "g",
  ხ: "h",
  ქ: "q",
  ყ: "k",
  ც: "c",
  წ: "c",
  ჩ: "c",
  ჭ: "c",
  ჟ: "j",
  ძ: "z",
  ჯ: "dj",
  ფ: "ph",
  თ: "th",
};

/**
 * The reduced Georgian alphabet used by the Georgian lane. Each pair that
 * shares a Latin spelling collapses onto one representative, so a query and an
 * index entry can differ by exactly the distinction the typist did not make.
 *
 * @type {Record<string, string>}
 */
export const KA_FOLD = {
  ტ: "თ", // both `t`
  კ: "ქ", // both `k`
  წ: "ც", // both `ts`
  ჭ: "ჩ", // both `ch`
  ჰ: "ხ", // both reachable as `h`
  ძ: "ზ", // `dz` vs `z`
  ჟ: "ჯ", // `zh` vs `j`
  ღ: "გ", // `gh` vs `g`
};

/**
 * Latin → folded Georgian. Digraphs are matched first, so `sh` never comes out
 * as `ს`+`ჰ`. Values are already folded, which is why several keys land on the
 * same letter.
 *
 * `q` maps to ყ rather than ქ because `KA_TO_LAT` sends ყ to `q`; keeping the
 * round trip closed matters more here than matching the keyboard, and `k`
 * already covers ქ.
 *
 * @type {Record<string, string>}
 */
export const LAT_TO_KA = {
  zh: "ჯ",
  gh: "გ",
  kh: "ხ",
  sh: "შ",
  ch: "ჩ",
  ts: "ც",
  dz: "ზ",
  ph: "ფ",
  a: "ა",
  b: "ბ",
  c: "ც",
  d: "დ",
  e: "ე",
  f: "ფ",
  g: "გ",
  h: "ხ",
  i: "ი",
  j: "ჯ",
  k: "ქ",
  l: "ლ",
  m: "მ",
  n: "ნ",
  o: "ო",
  p: "პ",
  q: "ყ",
  r: "რ",
  s: "ს",
  t: "თ",
  u: "უ",
  v: "ვ",
  w: "ვ",
  x: "ხ",
  y: "ყ",
  z: "ზ",
};

const KA_LETTER = /[Ⴀ-ჿᲐ-Ჿ]/;

/** Whether a string contains any Georgian letter. */
export function hasGeorgian(text) {
  return KA_LETTER.test(text);
}

/** Whether a string contains any ASCII letter. */
export function hasLatin(text) {
  return /[a-z]/i.test(text);
}

/* ------------------------------------------------------------------ */
/* Mapped-string plumbing                                              */
/* ------------------------------------------------------------------ */

/**
 * A transformed string that remembers where each of its characters came from.
 *
 * Highlighting is the reason this exists. Fuse reports match positions in the
 * *normalized* text, but what gets painted on screen is the original title, so
 * every stage has to be able to hand an offset back.
 *
 * @typedef {{ chars: string[], map: number[] }} Mapped
 */

/** @returns {Mapped} */
function seed(text) {
  /** @type {string[]} */
  const chars = [];
  /** @type {number[]} */
  const map = [];
  let offset = 0;
  for (const ch of text) {
    chars.push(ch);
    map.push(offset);
    offset += ch.length;
  }
  return { chars, map };
}

/**
 * Rewrites each character, keeping the source offset for every character the
 * replacement produces. A replacement may be empty (drop), one character, or
 * several (`ღ` → `gh`).
 *
 * @param {Mapped} state
 * @param {(ch: string) => string} fn
 * @returns {Mapped}
 */
function rewrite(state, fn) {
  /** @type {string[]} */
  const chars = [];
  /** @type {number[]} */
  const map = [];
  for (let i = 0; i < state.chars.length; i += 1) {
    const out = fn(state.chars[i]);
    for (const c of out) {
      chars.push(c);
      map.push(state.map[i]);
    }
  }
  return { chars, map };
}

/** @param {Mapped} state @returns {string} */
const render = (state) => state.chars.join("");

const COMBINING = /[̀-ͯ]/g;

/** @param {Mapped} state @returns {Mapped} */
const stripDiacritics = (state) =>
  rewrite(state, (ch) => ch.normalize("NFD").replace(COMBINING, ""));

/** @param {Mapped} state @returns {Mapped} */
const lower = (state) => rewrite(state, (ch) => ch.toLowerCase());

/**
 * Separators that carry no meaning for matching. They become spaces rather
 * than disappearing, so `12/512GB` folds to `12 512gb` — the same thing the
 * shopper types — instead of the unsearchable `12512gb`.
 *
 * @param {Mapped} state @returns {Mapped}
 */
const separators = (state) =>
  rewrite(state, (ch) => (/[-–—/\\_,.·•+|()[\]{}"'`«»„“”]/.test(ch) ? " " : ch));

const isDigit = (ch) => ch >= "0" && ch <= "9";
const isLetter = (ch) => /[a-zႠ-ჿᲐ-Ჿ]/.test(ch);

/**
 * Puts a space on every digit↔letter boundary, so `S26Ultra` and `S26 Ultra`
 * fold to the same thing. Applied to the query and the index alike; it does not
 * matter that `s 26 ultra` is not how anyone writes it, only that both sides
 * agree.
 *
 * The inserted space is attributed to the character before it, so a highlight
 * spanning the boundary still covers the original text.
 *
 * @param {Mapped} state @returns {Mapped}
 */
function digitBoundaries(state) {
  /** @type {string[]} */
  const chars = [];
  /** @type {number[]} */
  const map = [];
  for (let i = 0; i < state.chars.length; i += 1) {
    const ch = state.chars[i];
    const prev = chars[chars.length - 1];
    if (
      prev !== undefined &&
      ((isDigit(prev) && isLetter(ch)) || (isLetter(prev) && isDigit(ch)))
    ) {
      chars.push(" ");
      map.push(map[map.length - 1]);
    }
    chars.push(ch);
    map.push(state.map[i]);
  }
  return { chars, map };
}

/**
 * Collapses runs of whitespace to one space and trims the ends.
 *
 * @param {Mapped} state @returns {Mapped}
 */
function collapse(state) {
  /** @type {string[]} */
  const chars = [];
  /** @type {number[]} */
  const map = [];
  for (let i = 0; i < state.chars.length; i += 1) {
    const ch = /\s/.test(state.chars[i]) ? " " : state.chars[i];
    if (ch === " " && (chars.length === 0 || chars[chars.length - 1] === " "))
      continue;
    chars.push(ch);
    map.push(state.map[i]);
  }
  while (chars.length && chars[chars.length - 1] === " ") {
    chars.pop();
    map.pop();
  }
  return { chars, map };
}

/* ------------------------------------------------------------------ */
/* Transliteration stages                                              */
/* ------------------------------------------------------------------ */

/** @param {Mapped} state @returns {Mapped} */
const kaToLatin = (state) => rewrite(state, (ch) => KA_TO_LAT[ch] ?? ch);

/** @param {Mapped} state @returns {Mapped} */
const foldKa = (state) => rewrite(state, (ch) => KA_FOLD[ch] ?? ch);

/**
 * Latin → folded Georgian, digraphs first. Needs two characters of lookahead,
 * so it cannot go through `rewrite`.
 *
 * @param {Mapped} state @returns {Mapped}
 */
function latinToKa(state) {
  /** @type {string[]} */
  const chars = [];
  /** @type {number[]} */
  const map = [];
  for (let i = 0; i < state.chars.length; i += 1) {
    const pair = state.chars[i] + (state.chars[i + 1] ?? "");
    const digraph = LAT_TO_KA[pair];
    if (digraph) {
      chars.push(digraph);
      map.push(state.map[i]);
      i += 1;
      continue;
    }
    const single = LAT_TO_KA[state.chars[i]];
    chars.push(single ?? state.chars[i]);
    map.push(state.map[i]);
  }
  return { chars, map };
}

/* ------------------------------------------------------------------ */
/* Public normalizers                                                  */
/* ------------------------------------------------------------------ */

/**
 * Script-agnostic normalization: lowercase, no diacritics, no separators,
 * spaces on digit↔letter boundaries, single-spaced, trimmed. Georgian stays
 * Georgian and Latin stays Latin.
 *
 * @param {string} text
 * @returns {Mapped}
 */
export function normalizeMapped(text) {
  return collapse(
    digitBoundaries(separators(lower(stripDiacritics(seed(text ?? ""))))),
  );
}

/** @param {string} text @returns {string} */
export function normalize(text) {
  return render(normalizeMapped(text));
}

/**
 * Normalized, with every Georgian letter turned into its primary Latin
 * spelling. This is what the Latin lane of the index stores.
 *
 * @param {string} text
 * @returns {Mapped}
 */
export function toLatinMapped(text) {
  return collapse(
    digitBoundaries(
      separators(kaToLatin(lower(stripDiacritics(seed(text ?? ""))))),
    ),
  );
}

/** @param {string} text @returns {string} */
export function toLatin(text) {
  return render(toLatinMapped(text));
}

/**
 * Normalized, with everything reduced to the folded Georgian alphabet — Latin
 * transliterated in, Georgian collapsed onto its representatives. This is what
 * the Georgian lane of the index stores.
 *
 * @param {string} text
 * @returns {Mapped}
 */
export function toGeorgianMapped(text) {
  return collapse(
    digitBoundaries(
      separators(foldKa(latinToKa(lower(stripDiacritics(seed(text ?? "")))))),
    ),
  );
}

/** @param {string} text @returns {string} */
export function toGeorgian(text) {
  return render(toGeorgianMapped(text));
}

/* ------------------------------------------------------------------ */
/* Candidates                                                          */
/* ------------------------------------------------------------------ */

/** Cap on how many Latin spellings one Georgian query may produce. */
const MAX_CANDIDATES = 8;

/**
 * Latin spellings to try for a query.
 *
 * A full cartesian product over the ambiguous letters would be exponential —
 * `ღვიძლის ჩირაღდანი` alone has five — so this generates the primary spelling,
 * then each single ambiguous letter swapped on its own, then all of them
 * swapped together. That covers the realistic cases (a typist is consistent, or
 * slips on one letter) in linear space.
 *
 * `ქს` → `x` is bolted on afterwards as a whole-string variant: it is the one
 * digraph where Georgian spells out a Latin letter, and it is how `ქსიაომი`
 * reaches `xiaomi`.
 *
 * @param {string} query
 * @returns {string[]} normalized, de-duplicated, primary spelling first
 */
export function latinCandidates(query) {
  const primary = toLatin(query);
  /** @type {string[]} */
  const out = [primary];

  if (hasGeorgian(query)) {
    const chars = Array.from(query.toLowerCase());
    const ambiguous = chars
      .map((ch, i) => (KA_ALT_LAT[ch] ? i : -1))
      .filter((i) => i >= 0);

    const spell = (/** @type {Set<number>} */ swapped) =>
      toLatin(
        chars
          .map((ch, i) =>
            swapped.has(i) && KA_ALT_LAT[ch] ? KA_ALT_LAT[ch] : ch,
          )
          .join(""),
      );

    for (const i of ambiguous) out.push(spell(new Set([i])));
    if (ambiguous.length > 1) out.push(spell(new Set(ambiguous)));

    const x = toLatin(query.replace(/ქს/g, "x"));
    if (x !== primary) out.push(x);
  }

  return [...new Set(out.filter(Boolean))].slice(0, MAX_CANDIDATES);
}

/**
 * The single folded-Georgian spelling to try for a query. No branching: the
 * fold has already merged everything that could have branched.
 *
 * @param {string} query
 * @returns {string}
 */
export function georgianCandidate(query) {
  return toGeorgian(query);
}

/* ------------------------------------------------------------------ */
/* Offsets                                                             */
/* ------------------------------------------------------------------ */

/**
 * Translates `[start, end]` ranges reported against a normalized string back
 * into ranges over the original text, merging any that end up touching.
 *
 * Fuse reports inclusive end indices; so do the ranges returned here.
 *
 * @param {Mapped} mapped the normalization that produced the searched string
 * @param {ReadonlyArray<readonly [number, number]>} ranges
 * @param {number} originalLength
 * @returns {Array<[number, number]>}
 */
export function toOriginalRanges(mapped, ranges, originalLength) {
  /** @type {Array<[number, number]>} */
  const spans = [];
  for (const [from, to] of ranges) {
    const lo = Math.max(0, Math.min(from, mapped.map.length - 1));
    const hi = Math.max(lo, Math.min(to, mapped.map.length - 1));
    if (mapped.map.length === 0) continue;
    // The end is the offset *past* the source character, not its start, or a
    // one-to-many stage (`ღ` → `gh`) would highlight one character short. Every
    // script in play here is one UTF-16 unit per character, hence the `+ 1`.
    spans.push([mapped.map[lo], Math.min(originalLength, mapped.map[hi] + 1)]);
  }
  if (!spans.length) return [];

  spans.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  /** @type {Array<[number, number]>} */
  const merged = [spans[0]];
  for (const span of spans.slice(1)) {
    const last = merged[merged.length - 1];
    if (span[0] <= last[1]) last[1] = Math.max(last[1], span[1]);
    else merged.push(span);
  }
  return merged;
}
