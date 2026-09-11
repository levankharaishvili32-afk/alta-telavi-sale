#!/usr/bin/env node
/**
 * build-comparisons.mjs — precompute "ხშირად ადარებენ" suggestions.
 *
 * Writes data/comparisons.json, keyed by product id. All scoring happens here,
 * at build time; the picker modal only reads a list.
 *
 * The model
 * ---------
 * A suggestion is useful when it is a product the shopper might *actually buy
 * instead*. That is mostly a budget question, so price proximity carries the
 * most weight; then how alike the specifications are, weighted by the schema
 * order in `data/spec-schema.json` (screen size matters more than weight);
 * then a nudge toward a different brand, because a same-brand pairing is
 * usually two variants of one product rather than a decision; then a small
 * pull toward a similar discount depth.
 *
 *   price proximity     ×4
 *   spec similarity     ×3   (schema-position-weighted, normalised)
 *   different brand     ×1.5
 *   similar discount    ×0.5
 *
 * Base-model deduplication
 * ------------------------
 * The catalog carries near-identical rows that differ only by colour or
 * storage — Honor X6c in three colours, Galaxy A07 in four. Without folding
 * those together the top three suggestions are the same phone three times,
 * which is worse than useless. `baseModelKey` strips colour words, capacity
 * tokens, network badges and bracketed part numbers, and only one product per
 * base model survives.
 *
 * Fallback
 * --------
 * When fewer than `TOP_N` candidates clear MIN_SCORE, the remainder is filled
 * with the deepest discounts in the same category and marked
 * `kind: "popular"`, so the UI can label them honestly rather than passing
 * them off as similar.
 *
 * Usage
 * -----
 *   npm run comparisons
 *   npm run comparisons -- --explain 145224   score breakdown for one product
 */

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Shared with build-feed.js, which needs the same notion of "same model, other
// colour" for g:item_group_id. Two copies would silently drift.
import { baseModelKey } from "./lib/variants.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PRODUCTS_FILE = path.join(ROOT, "data", "products.json");
const SCHEMA_FILE = path.join(ROOT, "data", "spec-schema.json");
const OUT_FILE = path.join(ROOT, "data", "comparisons.json");

/**
 * Stored per product. The picker shows three, but has to skip anything already
 * in the comparison bar, so it needs a few spares.
 */
const STORE_N = 8;
const TOP_N = 3;
/** Below this a "similar" suggestion is not worth the shopper's attention. */
const MIN_SCORE = 0.45;

const WEIGHTS = {
  price: 4,
  specs: 3,
  differentBrand: 1.5,
  discount: 0.5,
  /**
   * BEHAVIOURAL HOOK — currently inert.
   *
   * `components/ComparePicker.tsx` records every completed comparison as a
   * sorted id pair under the `compare_pairs` localStorage key, readable with
   * `window.__getComparePairs()`. Once enough of that has been collected,
   * export it to `data/compare-pairs.json` as
   *
   *     { "145224|157978": 42, … }
   *
   * and this script will pick it up automatically: see `pairSignal` below.
   * Raise this weight from 0 to start letting real behaviour outvote the
   * heuristics. Around 2 puts it on par with spec similarity; going much
   * higher makes the suggestions self-reinforcing, since a pair can only be
   * observed if it was suggested.
   */
  observed: 0,
};

const PAIRS_FILE = path.join(ROOT, "data", "compare-pairs.json");

// ------------------------------------------------------------------ utils

const norm = (s) => String(s ?? "").toLowerCase().replace(/\s+/g, " ").trim();

async function readJson(file) {
  try {
    return JSON.parse(await fs.readFile(file, "utf8"));
  } catch {
    return null;
  }
}

/** Pull the leading number out of a spec value: "6.1\"" → 6.1, "8 GB" → 8. */
function numeric(value) {
  const m = String(value ?? "").match(/-?\d+(?:[.,]\d+)?/);
  if (!m) return null;
  const n = Number(m[0].replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

const proximity = (a, b) => {
  const hi = Math.max(Math.abs(a), Math.abs(b));
  if (hi === 0) return 1;
  return Math.max(0, 1 - Math.abs(a - b) / hi);
};

const discountOf = (p) =>
  p.old_price > p.promo_price
    ? (p.old_price - p.promo_price) / p.old_price
    : 0;

// ---------------------------------------------------------------- scoring

/**
 * Specification similarity, 0–1.
 *
 * Each key is weighted by its position in the schema, which is already ordered
 * most-decision-relevant first. Keys missing on either side are skipped
 * entirely *and* excluded from the normaliser, so a product with sparse specs
 * is compared on what it does declare rather than punished for what it does
 * not.
 */
function specScore(a, b, keys) {
  if (!keys.length) return { score: 0, used: 0 };
  let total = 0;
  let usedWeight = 0;

  for (const [index, key] of keys.entries()) {
    const left = a.specs?.[key];
    const right = b.specs?.[key];
    if (!left || !right) continue;

    const weight = (keys.length - index) / keys.length;
    usedWeight += weight;

    const nl = numeric(left);
    const nr = numeric(right);
    total +=
      weight *
      (nl !== null && nr !== null
        ? proximity(nl, nr)
        : norm(left) === norm(right)
          ? 1
          : 0);
  }

  return {
    score: usedWeight > 0 ? total / usedWeight : 0,
    used: usedWeight,
  };
}

/** Observed co-comparisons, if any have been exported yet. See WEIGHTS. */
function pairSignal(pairs, a, b) {
  if (!pairs) return 0;
  const key = [a.id, b.id].sort().join("|");
  const count = pairs[key] ?? 0;
  if (!count) return 0;
  // Diminishing returns: the tenth co-comparison says much less than the first.
  return Math.min(1, Math.log10(1 + count) / Math.log10(11));
}

function scorePair(a, b, keys, pairs) {
  const price = proximity(a.promo_price, b.promo_price);
  const specs = specScore(a, b, keys);
  const differentBrand = norm(a.brand) !== norm(b.brand) ? 1 : 0;
  const discount = proximity(discountOf(a), discountOf(b));
  const observed = pairSignal(pairs, a, b);

  const raw =
    WEIGHTS.price * price +
    WEIGHTS.specs * specs.score +
    WEIGHTS.differentBrand * differentBrand +
    WEIGHTS.discount * discount +
    WEIGHTS.observed * observed;

  const max =
    WEIGHTS.price +
    WEIGHTS.specs +
    WEIGHTS.differentBrand +
    WEIGHTS.discount +
    WEIGHTS.observed;

  return {
    score: raw / max,
    parts: { price, specs: specs.score, differentBrand, discount, observed },
  };
}

// -------------------------------------------------------------------- main

async function main() {
  const argv = process.argv.slice(2);
  const explainAt = argv.indexOf("--explain");
  const explainId = explainAt >= 0 ? argv[explainAt + 1] : null;

  const products = await readJson(PRODUCTS_FILE);
  if (!products?.length) throw new Error(`ვერ წავიკითხე ${PRODUCTS_FILE}`);
  const schema = await readJson(SCHEMA_FILE);
  const pairs = await readJson(PAIRS_FILE);
  if (pairs) console.log(`ქცევითი სიგნალი: ${Object.keys(pairs).length} წყვილი`);

  const byScope = new Map();
  for (const p of products) {
    const scope = `${p.category}/${p.subcategory}`;
    if (!byScope.has(scope)) byScope.set(scope, []);
    byScope.get(scope).push(p);
  }

  const baseKeys = new Map(products.map((p) => [p.id, baseModelKey(p)]));
  const out = {};
  const stats = { similar: 0, popular: 0, none: 0 };

  for (const [scope, peers] of byScope) {
    const keys = schema?.categories?.[scope]?.keys ?? [];

    for (const product of peers) {
      const scored = peers
        .filter((other) => other.id !== product.id)
        // One row per base model: the best-scoring colour stands for the rest.
        .map((other) => ({ other, ...scorePair(product, other, keys, pairs) }))
        .sort((x, y) => y.score - x.score);

      const seenBase = new Set([baseKeys.get(product.id)]);
      const similar = [];
      for (const entry of scored) {
        if (entry.score < MIN_SCORE) break;
        const base = baseKeys.get(entry.other.id);
        if (seenBase.has(base)) continue;
        seenBase.add(base);
        similar.push({ ...entry, kind: "similar" });
        if (similar.length >= STORE_N) break;
      }

      // Fill from the deepest discounts in the same category — labelled
      // differently, because they are not claimed to be similar.
      const popular = [];
      if (similar.length < STORE_N) {
        for (const other of [...peers].sort(
          (x, y) => discountOf(y) - discountOf(x),
        )) {
          if (other.id === product.id) continue;
          const base = baseKeys.get(other.id);
          if (seenBase.has(base)) continue;
          seenBase.add(base);
          popular.push({
            other,
            score: 0,
            parts: null,
            kind: "popular",
          });
          if (similar.length + popular.length >= STORE_N) break;
        }
      }

      const list = [...similar, ...popular];
      if (!list.length) {
        stats.none += 1;
        continue;
      }
      if (similar.length >= TOP_N) stats.similar += 1;
      else stats.popular += 1;

      out[product.id] = list.map((entry) => ({
        id: entry.other.id,
        kind: entry.kind,
        score: Number(entry.score.toFixed(3)),
        ...(entry.parts
          ? {
              why: Object.fromEntries(
                Object.entries(entry.parts).map(([k, v]) => [
                  k,
                  Number(v.toFixed(2)),
                ]),
              ),
            }
          : {}),
      }));

      if (explainId && product.id === explainId) {
        console.log(`\n${product.title} — ${product.promo_price}₾`);
        console.log(`base model: ${baseKeys.get(product.id)}`);
        for (const entry of list.slice(0, 6)) {
          const w = entry.parts
            ? Object.entries(entry.parts)
                .map(([k, v]) => `${k}=${v.toFixed(2)}`)
                .join(" ")
            : "fallback";
          console.log(
            `  ${entry.score.toFixed(3)} [${entry.kind}] ${entry.other.promo_price}₾ ` +
              `${entry.other.title.slice(0, 52)}  ${w}`,
          );
        }
      }
    }
  }

  await fs.writeFile(
    OUT_FILE,
    `${JSON.stringify(out, null, 2)}\n`,
    "utf8",
  );
  console.log(
    `\ndata/comparisons.json — ${Object.keys(out).length} პროდუქტი ` +
      `(${stats.similar} სრული, ${stats.popular} შევსებული, ${stats.none} ცარიელი)`,
  );
}

main().catch((error) => {
  console.error(String(error.message ?? error));
  process.exit(1);
});
