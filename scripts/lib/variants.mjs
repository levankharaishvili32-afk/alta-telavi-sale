/**
 * Colour and capacity variants of the same model.
 *
 * Shared vocabulary — colour words, capacity and network patterns, tier words —
 * plus two keys built from it, because two build scripts ask two different
 * questions of the same titles:
 *
 *   baseModelKey  "is this near enough that suggesting it would be pointless?"
 *                 Used by build-comparisons.mjs. Folding too much only costs
 *                 variety in a suggestion list, so it folds hard.
 *   feedGroupKey  "is this literally the same product in another colour?"
 *                 Used by build-feed.js for g:item_group_id. Folding too much
 *                 puts unrelated products in one ad carousel, so it is strict.
 *
 * Keeping them in one file is the point: they draw on the same colour list, so
 * a spelling added for one is available to the other.
 *
 * Lives under `scripts/` because it is build-time only — nothing here reaches
 * the browser bundle.
 */

const norm = (s) =>
  String(s ?? "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

/** Colour words that appear in titles, in both languages the catalog mixes. */
export const COLOUR_WORDS = [
  "black", "white", "grey", "gray", "silver", "gold", "golden", "blue",
  "green", "red", "pink", "violet", "purple", "yellow", "orange", "brown",
  "beige", "cream", "titanium", "graphite", "midnight", "starlight", "sierra",
  "space", "navy", "mint", "lavender", "cyan", "teal", "bronze", "copper",
  "charcoal", "sand", "desert", "velvet", "ocean", "icy", "nova", "meteor",
  "obsidian", "moonlight", "sunrise", "transparent", "clear",
  "შავი", "თეთრი", "ნაცრისფერი", "ვერცხლისფერი", "ოქროსფერი", "ლურჯი",
  "მწვანე", "წითელი", "ვარდისფერი", "იისფერი", "ყვითელი", "ნარინჯისფერი",
];

export const CAPACITY = /\b\d+(gb|tb|mb|mah|w|hz|mp|ml|l)\b/gi;
export const NETWORK = /\b(5g|4g|lte|wi-?fi|dual ?sim|duos|nfc|esim)\b/gi;
export const BRACKETED = /\([^)]*\)|\[[^\]]*\]/g;

/** Qualifiers that genuinely separate two models, not two colours. */
export const TIER_WORDS = new Set([
  "pro", "plus", "ultra", "max", "lite", "mini", "fe", "se", "air", "prime",
  "neo", "edge", "note", "+",
]);

/**
 * Reduce a title to the model underneath it, so colour and storage variants
 * collapse onto one key.
 *
 * Stripping a list of colour words is not enough on its own — the catalog
 * ships "Icy Blue", "Silver Shadow", "Ocean Cian", "Meteor Silver", and the
 * vocabulary has no end. What every model name *does* have is a token
 * containing a digit: S25, X6c, M170, 50V6C, 15. Colours never do. So the key
 * is everything up to and including the last digit-bearing token, plus a
 * following tier word if there is one — which keeps Honor 600 and Honor 600
 * Pro apart while folding all six colours of each together.
 */
export function baseModelKey(product) {
  let title = norm(product.title)
    .replace(BRACKETED, " ")
    .replace(CAPACITY, " ")
    .replace(NETWORK, " ")
    // "12GB/512GB" leaves a bare slash behind; "8/256" needs removing outright.
    .replace(/\b\d+\s*\/\s*\d+\b/g, " ")
    .replace(/[-–—_,/]+/g, " ");

  for (const colour of COLOUR_WORDS) {
    title = title.replace(new RegExp(`\\b${colour}\\b`, "gi"), " ");
  }

  const words = title.split(/\s+/).filter(Boolean);
  let last = -1;
  for (const [i, word] of words.entries()) if (/\d/.test(word)) last = i;

  let key;
  if (last === -1) {
    // No model designator at all ("Apple iPhone Air"). Cap at three tokens:
    // colour names are two words often enough — "Cloud White", "Light Gold" —
    // that stripping the known colour still leaves a distinguishing tail.
    key = words.slice(0, 3).join(" ");
  } else {
    const tail = words[last + 1];
    key = words.slice(0, last + (tail && TIER_WORDS.has(tail) ? 2 : 1)).join(" ");
  }

  // Never collapse everything onto one empty key.
  return `${product.category}/${product.subcategory}/${key || product.id}`;
}

/* ------------------------------------------------------------------ */
/* The variant suffix                                                  */
/* ------------------------------------------------------------------ */

/**
 * The trailing part of a title that names a variant rather than a product.
 *
 * Two shapes cover this catalog, and neither can be done with a colour word
 * list alone — "Sage", "Ultramarine", "Seashell" and "Grey Camo" are all real
 * entries here, and the next price list will invent more:
 *
 *   after a dash   "…DualSense Wireless Controller - Starlight Blue"
 *                  "…iPhone 16 128GB - Ultramarine"
 *   bare at the end "Honor X9d 8GB/256GB Midnight Black"
 *
 * The dash form is taken on structure alone: one to three words, no digits.
 * That shape is a finish, not a model — a genuine model suffix carries a
 * number ("Archer C6 - AC1200"), which the digit test rejects. The bare form
 * needs a known colour word to anchor it, and reaches one word further left to
 * pick up its qualifier ("Forest" in "Forest Green").
 *
 * @returns {{ text: string, from: number, words: string[] } | null} `from` is
 *   the index in `words` where the suffix starts.
 */
function variantSuffix(title) {
  const cleaned = String(title ?? "").replace(BRACKETED, " ");

  const dash = cleaned.match(/\s[-–—]\s+([^-–—]+)$/);
  if (dash) {
    const tail = dash[1].trim().split(/\s+/).filter(Boolean);
    if (tail.length >= 1 && tail.length <= 3 && !tail.some((w) => /\d/.test(w)))
      return { text: tail.join(" "), from: -1, words: tail };
  }

  const words = cleaned.replace(/[–—_,]+/g, " ").split(/\s+/).filter(Boolean);
  const lower = words.map((w) => w.toLowerCase().replace(/[^\p{L}]/gu, ""));
  const palette = new Set(COLOUR_WORDS);

  // Only a *trailing* run counts. A colour in the middle of a title is part of
  // the product name ("Black Edition Keyboard"), not the variant axis.
  let from = words.length;
  while (from > 0 && palette.has(lower[from - 1])) from -= 1;
  if (from === words.length) return null;

  // One qualifier further left, but only when the run is a single bare colour
  // word that plainly wants one: "Forest" Green, "Sky" Blue, "Cosmic" Orange.
  // A two-word run already names itself — reaching past "Midnight Black" turns
  // "Without Charger Midnight Black" into a colour called "Charger Midnight
  // Black".
  const runLength = words.length - from;
  if (
    runLength === 1 &&
    from > 0 &&
    !TIER_WORDS.has(lower[from - 1]) &&
    !/\d/.test(words[from - 1])
  )
    from -= 1;

  const tail = words.slice(from);
  return tail.length ? { text: tail.join(" "), from, words: tail } : null;
}

const titleCase = (s) =>
  s
    .split(/\s+/)
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1).toLowerCase() : w))
    .join(" ");

/**
 * The colour as the title writes it — "Cosmic Orange", not "Orange"; "Grey
 * Camo", not "Grey". Null when the title names no variant at all, which is
 * most of the catalog: a kettle has no colour to distinguish it from itself.
 *
 * @param {string} title
 * @returns {string | null}
 */
export function extractColour(title) {
  const suffix = variantSuffix(title);
  if (!suffix) return null;
  const name = suffix.text.replace(/[^\p{L}\s/]/gu, " ").replace(/\s+/g, " ").trim();
  // Title case, because Meta prints this string in the ad.
  return name ? titleCase(name) : null;
}

/**
 * The key that decides which products are the same item in another colour or
 * capacity — `g:item_group_id`.
 *
 * Stricter than `baseModelKey` on purpose, and the difference matters. That
 * one answers "is this near enough to be a pointless suggestion?", where
 * folding too much only costs variety. This one answers "is this literally the
 * same product?", where folding too much puts a DualSense controller and a
 * PULSE headset in the same ad carousel as though a shopper could pick between
 * them as colours of one thing. `baseModelKey` truncates at the model
 * designator, which does exactly that to the eleven PlayStation products.
 *
 * So this keeps everything the title says about *what the product is* and
 * removes only what it says about *which one* — capacity, network badge, and
 * the variant suffix above.
 */
export function feedGroupKey(product) {
  const suffix = variantSuffix(product.title);

  let title = String(product.title ?? "")
    .replace(BRACKETED, " ")
    .replace(CAPACITY, " ")
    .replace(NETWORK, " ")
    .replace(/\b\d+\s*\/\s*\d+\b/g, " ");

  if (suffix) {
    // Remove the suffix from the end only — the same words may legitimately
    // appear earlier ("Black Shark 5 Pro - Black").
    const at = title.lastIndexOf(suffix.text);
    if (at >= 0 && at + suffix.text.length >= title.trimEnd().length)
      title = title.slice(0, at);
  }

  const key = title
    .toLowerCase()
    .replace(/[-–—_,/]+/g, " ")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

  return `${product.category}/${product.subcategory}/${key || product.id}`;
}

/**
 * The capacity that separates one variant from another: "12GB/256GB",
 * "128GB", "1TB". Returned as written, minus spaces, because it is a label
 * rather than a measurement.
 *
 * Deliberately narrow — only storage and memory units. A kettle's "1.7 L" and
 * a monitor's "27''" are properties of a single product, not a variant axis,
 * and calling them `g:size` would tell Meta these are the same item in
 * different sizes when they are two different products.
 *
 * @param {string} title
 * @returns {string | null}
 */
export function extractSize(title) {
  const text = String(title ?? "");

  // "12GB/256GB" and "8GB/128GB" — memory and storage as one pair.
  const pair = text.match(/\b(\d+\s*(?:gb|tb))\s*\/\s*(\d+\s*(?:gb|tb))\b/i);
  if (pair) return `${squash(pair[1])}/${squash(pair[2])}`;

  // "8/256GB" — the first number's unit is implied.
  const implied = text.match(/\b(\d+)\s*\/\s*(\d+\s*(?:gb|tb))\b/i);
  if (implied) return `${implied[1]}/${squash(implied[2])}`;

  const single = text.match(/\b(\d+\s*(?:gb|tb))\b/i);
  if (single) return squash(single[1]);

  // Garment-style sizes, which is how mouse pads and bags are listed:
  // "Lenovo Legion MousePad (L)", "(XL)". Bracketed so it cannot collide with
  // a model letter — an unbracketed "L" is far more likely to be part of a
  // part number.
  const lettered = text.match(/\((XS|S|M|L|XL|XXL|XXXL)\)/i);
  return lettered ? lettered[1].toUpperCase() : null;
}

const squash = (s) => s.replace(/\s+/g, "").toUpperCase();
