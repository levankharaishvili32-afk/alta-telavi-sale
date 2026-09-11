#!/usr/bin/env node
/**
 * build-bundles.mjs — precompute the "ერთად იაფია" bundles.
 *
 * Everything here happens at build time. The site ships `data/bundles.json`
 * and makes no network call at runtime; nothing in `components/BundleBox.tsx`
 * knows that Meta or alta.ge exist.
 *
 * Pipeline
 * --------
 *   1. Pull the whole Alta catalog        → data/alta-catalog.json (24h cache)
 *   2. Read the accessory rules            ← data/accessory-rules.json
 *   3. Score every catalog item against every campaign product
 *   4. Resolve each pick to a source: "local" (on this site) or "alta" (off-site)
 *   5. Write data/bundles.json + reports/bundles-report.md
 *
 * Catalog sources
 * ---------------
 * Primary is the Meta Graph API, per the product set below. It needs
 * META_ACCESS_TOKEN in `.env` (or the environment) with catalog_management
 * permission on the owning business:
 *
 *     npm run bundles
 *
 * Secondary is the public product feed, which carries the same catalog without
 * a token — id, title, brand, price, sale price, availability, image and the
 * product URL, which is where the category comes from. Use it when you have no
 * token to hand, or to rebuild offline from a saved copy:
 *
 *     npm run bundles -- --from-feed
 *     npm run bundles -- --from-feed ./alta-product-feed.xml
 *
 * Both paths normalise into the same record shape, so the scoring below never
 * has to care which one ran.
 *
 * Flags
 * -----
 *   --force              ignore the 24h cache and re-fetch
 *   --from-feed [path]   use the XML feed instead of the Graph API
 *   --top <n>            accessories per product (default 3)
 *   --dry                score and report without writing data/bundles.json
 */

import { existsSync } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { XMLParser } from "fast-xml-parser";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CATALOG_CACHE = path.join(ROOT, "data", "alta-catalog.json");
const RULES_FILE = path.join(ROOT, "data", "accessory-rules.json");
const PRODUCTS_FILE = path.join(ROOT, "data", "products.json");
const CSV_FILE = path.join(ROOT, "data", "campaign-products.csv");
const BUNDLES_FILE = path.join(ROOT, "data", "bundles.json");
const REPORT_FILE = path.join(ROOT, "reports", "bundles-report.md");

const PRODUCT_SET_ID = "1416302266962777";
const GRAPH_VERSION = "v21.0";
const GRAPH_FIELDS =
  "retailer_id,name,brand,product_type,image_url,price,sale_price,url,availability";
const PAGE_LIMIT = 200;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const DEFAULT_FEED = "https://imgstore.alta.ge/images/alta-product-feed.xml";

// ------------------------------------------------------------------ args

function parseArgs(argv) {
  const flags = { force: false, fromFeed: null, top: 3, dry: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--force") flags.force = true;
    else if (arg === "--dry") flags.dry = true;
    else if (arg === "--top") flags.top = Number(argv[++i]);
    else if (arg === "--from-feed") {
      const next = argv[i + 1];
      flags.fromFeed = next && !next.startsWith("--") ? argv[++i] : DEFAULT_FEED;
    } else if (arg.startsWith("--")) throw new Error(`უცნობი დროშა: ${arg}`);
  }
  return flags;
}

// ----------------------------------------------------------------- utils

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function readJson(file) {
  try {
    return JSON.parse(await fs.readFile(file, "utf8"));
  } catch {
    return null;
  }
}

async function writeJson(file, value) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

/** Minimal .env reader — no dependency, and only for this script's token. */
async function loadEnv() {
  for (const name of [".env.local", ".env"]) {
    const file = path.join(ROOT, name);
    if (!existsSync(file)) continue;
    for (const line of (await fs.readFile(file, "utf8")).split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
      if (!m) continue;
      const value = m[2].replace(/^["']|["']$/g, "");
      if (value && !process.env[m[1]]) process.env[m[1]] = value;
    }
  }
}

async function fetchWithRetry(url, attempts = 3) {
  let last = null;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const res = await fetch(url, { headers: { Accept: "application/json" } });
      const text = await res.text();
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);
      return text;
    } catch (error) {
      last = error;
      if (attempt < attempts) await sleep(800 * 2 ** (attempt - 1));
    }
  }
  throw last;
}

/** "49.00 GEL", "₾49", 49, {amount:"49"} → 49 */
function money(value) {
  if (value == null) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "object") return money(value.amount ?? value.value);
  const n = Number(String(value).replace(/[^\d.,-]/g, "").replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** First path segment of an alta.ge product URL — its category. */
function categorySlugFromUrl(url) {
  const m = String(url ?? "").match(/^https?:\/\/[^/]+\/([^/?#]+)\//i);
  return m ? m[1].toLowerCase() : null;
}

const norm = (s) => String(s ?? "").toLowerCase().replace(/\s+/g, " ").trim();
const slugify = (s) =>
  norm(s)
    .replace(/[^a-z0-9Ⴀ-ჿ]+/g, "-")
    .replace(/^-+|-+$/g, "");

// ----------------------------------------------------- catalog: Graph API

async function fetchFromGraph() {
  const token = process.env.META_ACCESS_TOKEN;
  if (!token) {
    throw new Error(
      "META_ACCESS_TOKEN არ არის — ჩაწერე .env-ში, ან გაუშვი `--from-feed`.",
    );
  }

  const products = [];
  let url =
    `https://graph.facebook.com/${GRAPH_VERSION}/${PRODUCT_SET_ID}/products` +
    `?fields=${encodeURIComponent(GRAPH_FIELDS)}` +
    `&limit=${PAGE_LIMIT}&access_token=${encodeURIComponent(token)}`;

  let page = 0;
  while (url) {
    const body = JSON.parse(await fetchWithRetry(url));
    if (body.error) throw new Error(`Graph API: ${body.error.message}`);
    products.push(...(body.data ?? []));
    page += 1;
    process.stdout.write(`\r  გვერდი ${page}, სულ ${products.length}`);
    // Cursor pagination: Graph hands back a fully-formed next URL (token
    // included), so following it verbatim is both simpler and safer than
    // rebuilding the query from `paging.cursors.after`.
    url = body.paging?.next ?? null;
    if (url) await sleep(250);
  }
  process.stdout.write("\n");

  return products.map((p) => ({
    retailer_id: p.retailer_id != null ? String(p.retailer_id) : null,
    name: p.name ?? null,
    brand: p.brand ?? null,
    product_type: p.product_type ?? null,
    category_slug: categorySlugFromUrl(p.url) ?? slugify(p.product_type) ?? null,
    image_url: p.image_url ?? null,
    price: money(p.price),
    sale_price: money(p.sale_price),
    url: p.url ?? null,
    availability: norm(p.availability) || "in stock",
  }));
}

// --------------------------------------------------------- catalog: feed

async function fetchFromFeed(source) {
  const xml = /^https?:/i.test(source)
    ? await fetchWithRetry(source)
    : await fs.readFile(path.resolve(ROOT, source), "utf8");

  const parsed = new XMLParser({
    ignoreAttributes: false,
    trimValues: true,
    parseTagValue: false,
  }).parse(xml);

  const channel = parsed?.rss?.channel ?? parsed?.channel ?? {};
  const items = [].concat(channel.item ?? []);

  // Feeds are inconsistent about the `g:` prefix; accept either spelling.
  const pick = (item, key) => item[`g:${key}`] ?? item[key] ?? null;

  return items.map((item) => {
    const url = pick(item, "link");
    return {
      retailer_id: pick(item, "id") != null ? String(pick(item, "id")) : null,
      name: pick(item, "title"),
      brand: pick(item, "brand"),
      // The feed has no product_type; the URL's category segment is the
      // closest equivalent and is what the rules match on anyway.
      product_type: null,
      category_slug: categorySlugFromUrl(url),
      image_url: pick(item, "image_link"),
      price: money(pick(item, "price")),
      sale_price: money(pick(item, "sale_price")),
      url: url ? url.replace(/^https?:\/\/[^/]+/i, (m) => m.toLowerCase()) : null,
      availability: norm(pick(item, "availability")) || "in stock",
    };
  });
}

// ------------------------------------------------------------- catalog IO

async function loadCatalog(flags) {
  const cached = await readJson(CATALOG_CACHE);
  if (!flags.force && cached?.fetched_at && cached.products?.length) {
    const age = Date.now() - Date.parse(cached.fetched_at);
    if (Number.isFinite(age) && age < CACHE_TTL_MS) {
      console.log(
        `ქეშიდან: ${cached.products.length} პროდუქტი ` +
          `(${Math.round(age / 3_600_000)} სთ-ის წინ, წყარო: ${cached.source}).`,
      );
      return { products: cached.products, source: cached.source, cached: true };
    }
  }

  const source = flags.fromFeed ? `feed:${flags.fromFeed}` : "graph";
  console.log(`კატალოგის ჩამოტვირთვა — ${source}`);

  let products;
  try {
    products = flags.fromFeed
      ? await fetchFromFeed(flags.fromFeed)
      : await fetchFromGraph();
  } catch (error) {
    /*
     * An expired cache is worth far more than no catalog at all. The 24h TTL
     * exists to keep the accessory suggestions fresh, not to make the build
     * fail the day Alta's feed is unreachable — and it regularly is from a
     * sandboxed environment. Loud, dated, and it still runs.
     */
    if (!cached?.products?.length) throw error;
    const days = Math.round(
      (Date.now() - Date.parse(cached.fetched_at)) / 86_400_000,
    );
    console.warn(
      `!! ჩამოტვირთვა ვერ მოხერხდა (${String(error.message ?? error)})\n` +
        `!! გამოყენებულია ვადაგასული ქეში: ${cached.products.length} პროდუქტი, ` +
        `${days} დღის წინ. სიახლისთვის — \`npm run bundles -- --force\` ` +
        `ქსელთან წვდომისას.`,
    );
    return { products: cached.products, source: cached.source, cached: true };
  }

  const clean = products.filter((p) => p.retailer_id && p.name);
  await writeJson(CATALOG_CACHE, {
    source,
    product_set_id: PRODUCT_SET_ID,
    fetched_at: new Date().toISOString(),
    count: clean.length,
    products: clean,
  });
  console.log(`ჩაიწერა ${clean.length} პროდუქტი → data/alta-catalog.json`);
  return { products: clean, source, cached: false };
}

// ------------------------------------------------------------- model tokens

/**
 * Two ways a title names a model, because one is not enough.
 *
 * A *code* mixes letters and digits — "S26", "A9N", "X7d", "TL-WN822N". That
 * mix is what separates a model code from an ordinary word, so the capacity
 * and standard noise ("128GB", "5G", "4K") has to be filtered back out or it
 * matches everything.
 *
 * A *phrase* is a word followed by its number — "iphone 15", "galaxy a57",
 * "redmi 15c". Without this, "Apple iPhone 15 128GB - Black" yields no code at
 * all: "iPhone" has no digit and "15" has no letter. That gap is exactly where
 * the wrong accessories got in.
 */
const TOKEN_NOISE =
  /^(\d+(gb|tb|mb|kb|w|v|hz|mah|mm|cm|ml|l|k|mp|bit|nm|fps)|[2345]g|4k|8k|hd|fhd|uhd|usb\d?|hdmi|type-?c|wi-?fi\d?|bt\d?|ip\d+|led|lcd|oled|qled|ips|va|rgb|ssd|hdd|ddr\d|nvme|m2|pcie)$/i;

const PHRASE_STOPWORDS = new Set([
  "with", "and", "for", "the", "dual", "sim", "duos", "5g", "4g", "lte",
  "wifi", "wi-fi", "black", "white", "blue", "green", "gray", "grey", "gold",
  "silver", "pink", "violet", "ram", "rom", "gb", "tb",
]);

function modelTokens(title) {
  const words = String(title ?? "")
    .split(/[\s,()/\\|"']+/)
    .map((w) => w.replace(/^[-–—.]+|[-–—.,;:]+$/g, ""))
    .filter(Boolean);

  const codes = new Set();
  const phrases = new Set();

  for (const [i, word] of words.entries()) {
    const lower = word.toLowerCase();
    const hasLetter = /[a-z]/i.test(word);
    const hasDigit = /\d/.test(word);

    if (
      hasLetter &&
      hasDigit &&
      word.length >= 2 &&
      word.length <= 14 &&
      !TOKEN_NOISE.test(word)
    ) {
      codes.add(lower);
    }

    const next = words[i + 1]?.toLowerCase();
    if (
      next &&
      /^[a-z]{3,}$/i.test(word) &&
      !PHRASE_STOPWORDS.has(lower) &&
      /\d/.test(next) &&
      !TOKEN_NOISE.test(next) &&
      next.length <= 8
    ) {
      phrases.add(`${lower} ${next}`);
    }
  }

  return { codes: [...codes], phrases: [...phrases], all: [...codes, ...phrases] };
}

// ------------------------------------------------------------------ rules

function buildTypeMatcher(rules) {
  const types = Object.entries(rules.accessoryTypes ?? {}).map(([id, def]) => ({
    id,
    label: def.label ?? id,
    slugs: new Set((def.slugs ?? []).map((s) => s.toLowerCase())),
    match: (def.match ?? []).map(norm).filter(Boolean),
    exclude: (def.exclude ?? []).map(norm).filter(Boolean),
  }));

  /** Every accessory type an item could be. One item can satisfy several. */
  return (item) => {
    const title = norm(item.name);
    const slug = (item.category_slug ?? "").toLowerCase();
    const type = norm(item.product_type);
    const hits = [];
    for (const t of types) {
      const inSlug =
        t.slugs.has(slug) || [...t.slugs].some((s) => type.includes(s));
      if (!inSlug) continue;
      if (t.exclude.some((k) => title.includes(k))) continue;
      // An empty `match` means the whole category is this type — `buds` are
      // headphones, no keyword needed.
      if (t.match.length && !t.match.some((k) => title.includes(k))) continue;
      hits.push(t.id);
    }
    return hits;
  };
}

/** Rule lookup that tolerates "NOTEBOOK" / "notebook" / "Notebook". */
function buildCategoryLookup(rules) {
  const byKey = new Map();
  for (const [key, list] of Object.entries(rules.byCategory ?? {})) {
    byKey.set(slugify(key), list);
  }
  return (...candidates) => {
    for (const c of candidates) {
      const hit = byKey.get(slugify(c ?? ""));
      if (hit) return hit;
    }
    return null;
  };
}

// ----------------------------------------------------------------- scoring

function scoreAccessory({
  item,
  itemTypes,
  main,
  wantedTypes,
  mainTokens,
  modelGated,
}) {
  let score = 0;
  const why = [];
  const itemTitle = norm(item.name);
  const matchesModel = mainTokens.all.some((t) => itemTitle.includes(t));

  /*
   * Device-specific types are gated, not merely scored. A case or a screen
   * protector that names a different model is worse than no suggestion at
   * all — an iPhone 15 page was offering an AirPods cover and an iPhone 17
   * protector, both of which scored well on brand alone. If the accessory
   * names *some* model and it isn't this one, drop it; if it names none it is
   * a universal fit and may stay.
   */
  if (modelGated.has(itemTypes.find((t) => modelGated.has(t)) ?? "")) {
    if (!matchesModel) {
      const itemTokens = modelTokens(item.name);
      if (itemTokens.all.length) return { score: 0, why: ["model-mismatch"], type: null };
    }
  }

  if (main.brand && item.brand && norm(main.brand) === norm(item.brand)) {
    score += 3;
    why.push("brand");
  }

  if (matchesModel) {
    score += 3;
    why.push("model");
  }

  // Position in the rules list decides how much the category is worth: the
  // first accessory type the shop wants to sell with this product gets the
  // full point, the last gets a sliver.
  let bestType = null;
  if (wantedTypes?.length) {
    for (const type of itemTypes) {
      const i = wantedTypes.indexOf(type);
      if (i === -1) continue;
      const weight = 2 * ((wantedTypes.length - i) / wantedTypes.length);
      if (bestType === null || weight > bestType.weight) {
        bestType = { type, weight, rank: i };
      }
    }
  }
  if (bestType) {
    score += bestType.weight;
    why.push(`category:${bestType.type}`);
  }

  const itemPrice = item.sale_price ?? item.price;
  if (itemPrice != null && main.promo_price && itemPrice <= main.promo_price * 0.25) {
    score += 1;
    why.push("cheap");
  }

  return { score, why, type: bestType?.type ?? itemTypes[0] ?? null };
}

// -------------------------------------------------------------------- main

async function main() {
  const flags = parseArgs(process.argv.slice(2));
  await loadEnv();

  const rules = await readJson(RULES_FILE);
  if (!rules) throw new Error(`ვერ წავიკითხე ${RULES_FILE}`);
  const products = await readJson(PRODUCTS_FILE);
  if (!products?.length) throw new Error(`ვერ წავიკითხე ${PRODUCTS_FILE}`);

  // The campaign CSV keeps the human category name ("NOTEBOOK", "TV") that the
  // rules file is written against; products.json only keeps its slug.
  const csvCategory = new Map();
  if (existsSync(CSV_FILE)) {
    const text = await fs.readFile(CSV_FILE, "utf8");
    const [head, ...rows] = text.replace(/^﻿/, "").split("\n");
    const cols = head.split(",").map((c) => c.trim());
    const idAt = cols.indexOf("id");
    const catAt = cols.indexOf("category");
    for (const row of rows) {
      // Only the leading columns matter and neither is ever quoted.
      const cells = row.split(",");
      if (cells.length > catAt && cells[idAt])
        csvCategory.set(cells[idAt].trim(), cells[catAt].trim());
    }
  }

  const { products: catalog, source: catalogSource } = await loadCatalog(flags);
  const typesOf = buildTypeMatcher(rules);
  const rulesFor = buildCategoryLookup(rules);
  const modelGated = new Set(
    Object.entries(rules.accessoryTypes ?? {})
      .filter(([, def]) => def.requiresModelMatch)
      .map(([id]) => id),
  );

  // Index the catalog once: only in-stock items that resolve to at least one
  // accessory type are ever candidates, which takes 13k rows down to a few
  // thousand and makes the inner loop cheap.
  const candidates = [];
  for (const item of catalog) {
    if (!norm(item.availability).includes("in stock")) continue;
    if (!(item.sale_price ?? item.price)) continue;
    const itemTypes = typesOf(item);
    if (!itemTypes.length) continue;
    candidates.push({ item, itemTypes });
  }
  const byType = new Map();
  for (const c of candidates) {
    for (const t of c.itemTypes) {
      if (!byType.has(t)) byType.set(t, []);
      byType.get(t).push(c);
    }
  }
  console.log(
    `კანდიდატი აქსესუარები: ${candidates.length} ` +
      `(${byType.size} ტიპი) ${catalog.length}-დან`,
  );

  const localById = new Map(products.map((p) => [String(p.id), p]));
  const bundles = {};
  const diagnostics = [];

  for (const main of products) {
    const category = csvCategory.get(String(main.id)) ?? main.subcategory;
    const wantedTypes = rulesFor(category, main.subcategory);
    const mainTokens = modelTokens(main.title);

    // Only walk the accessory types this product actually wants. Without a
    // rule there is nothing to recommend — better an absent card than three
    // arbitrary products.
    const pool = new Map();
    for (const type of wantedTypes ?? []) {
      for (const c of byType.get(type) ?? []) pool.set(c.item.retailer_id, c);
    }

    const scored = [];
    for (const { item, itemTypes } of pool.values()) {
      if (String(item.retailer_id) === String(main.id)) continue;
      /*
       * There is deliberately no "same category is a substitute" guard here.
       * It was tempting — no phone cross-sold against a phone — but alta.ge
       * files a mouse, a keyboard and a mouse pad all under
       * `kompiuteris-aqsesuarebi`, so comparing category slugs silently cut
       * every mouse's bundle down to a pair of headphones. The rules file
       * already does this job precisely: a product's own accessory type never
       * appears in its own `byCategory` list.
       */

      const { score, why, type } = scoreAccessory({
        item,
        itemTypes,
        main,
        wantedTypes,
        mainTokens,
        modelGated,
      });
      if (score <= 0) continue;
      scored.push({ item, score, why, type });
    }

    scored.sort(
      (a, b) =>
        b.score - a.score ||
        (a.item.sale_price ?? a.item.price) - (b.item.sale_price ?? b.item.price),
    );

    // One pick per accessory type. Three cases of the same phone is a worse
    // bundle than a case, a protector and a charger, even if the three cases
    // score higher.
    const picked = [];
    const usedTypes = new Set();
    for (const entry of scored) {
      if (picked.length >= flags.top) break;
      if (entry.type && usedTypes.has(entry.type)) continue;
      if (entry.type) usedTypes.add(entry.type);
      picked.push(entry);
    }

    diagnostics.push({
      id: main.id,
      title: main.title,
      category: category ?? main.subcategory,
      hasRule: Boolean(wantedTypes?.length),
      poolSize: pool.size,
      found: picked.length,
    });

    if (!picked.length) continue;
    bundles[main.id] = picked.map(({ item, score, why, type }) =>
      resolveSource({ item, score, why, type, localById, rules }),
    );
  }

  if (!flags.dry) {
    await writeJson(BUNDLES_FILE, bundles);
    console.log(
      `ჩაიწერა data/bundles.json — ${Object.keys(bundles).length} პროდუქტს აქვს ბანდლი`,
    );
  }

  await writeReport({ diagnostics, bundles, catalogSource, catalog, candidates });
  console.log("ანგარიში: reports/bundles-report.md");
}

/**
 * Step 4. An accessory that is also a campaign product stays on this site at
 * the campaign price; everything else links out to alta.ge at catalog price.
 */
function resolveSource({ item, score, why, type, localById, rules }) {
  const label = rules.accessoryTypes?.[type]?.label ?? null;
  const local = localById.get(String(item.retailer_id));

  if (local) {
    return {
      id: String(local.id),
      source: "local",
      type,
      type_label: label,
      title: local.title,
      brand: local.brand,
      image: local.image,
      href: `/product/${local.id}`,
      price: local.promo_price,
      old_price: local.old_price > local.promo_price ? local.old_price : null,
      score: Number(score.toFixed(2)),
      why,
    };
  }

  const price = item.sale_price ?? item.price;
  return {
    id: String(item.retailer_id),
    source: "alta",
    type,
    type_label: label,
    title: item.name,
    brand: item.brand ?? null,
    image: item.image_url,
    href: item.url,
    price,
    old_price: item.sale_price && item.price > item.sale_price ? item.price : null,
    score: Number(score.toFixed(2)),
    why,
  };
}

// ------------------------------------------------------------------ report

async function writeReport({ diagnostics, bundles, catalogSource, catalog, candidates }) {
  const counts = { 3: 0, 2: 0, 1: 0, 0: 0 };
  for (const d of diagnostics) counts[Math.min(d.found, 3)] += 1;

  const byCategory = new Map();
  for (const d of diagnostics) {
    if (!byCategory.has(d.category))
      byCategory.set(d.category, { total: 0, found: 0, empty: 0, hasRule: d.hasRule, pool: 0 });
    const c = byCategory.get(d.category);
    c.total += 1;
    c.found += d.found;
    c.pool += d.poolSize;
    if (d.found === 0) c.empty += 1;
  }

  const rows = [...byCategory.entries()]
    .map(([category, c]) => ({
      category,
      total: c.total,
      avg: c.found / c.total,
      empty: c.empty,
      hasRule: c.hasRule,
      pool: Math.round(c.pool / c.total),
    }))
    .sort((a, b) => a.avg - b.avg || b.total - a.total);

  const weakest = rows.filter((r) => r.avg < 3);
  const noRule = rows.filter((r) => !r.hasRule);

  const sources = Object.values(bundles)
    .flat()
    .reduce((acc, a) => ({ ...acc, [a.source]: (acc[a.source] ?? 0) + 1 }), {});

  const table = (list, cols) =>
    list.length
      ? [`| ${cols.join(" | ")} |`, `| ${cols.map(() => "---").join(" | ")} |`, ...list, ""].join("\n")
      : "_არცერთი._\n";

  const md = `# ბანდლების ანგარიში — „ერთად იაფია"

წყარო: ${catalogSource === "graph" ? "Meta Graph API" : catalogSource}
კატალოგი: ${catalog.length} პროდუქტი, აქედან კანდიდატი აქსესუარი: ${candidates.length}

## დაფარვა

| აქსესუარი პროდუქტზე | პროდუქტი |
| --- | --- |
| 3 | ${counts[3]} |
| 2 | ${counts[2]} |
| 1 | ${counts[1]} |
| 0 | ${counts[0]} |

სულ ${diagnostics.length} პროდუქტი; ბანდლი აქვს ${Object.keys(bundles).length}-ს.
ბმულების წყარო: ${sources.local ?? 0} ლოკალური (ამ საიტზე), ${sources.alta ?? 0} alta.ge-ზე.

## ყველაზე სუსტი კატეგორიები

დალაგებულია საშუალო ნაპოვნი აქსესუარების მიხედვით. „წესი" = აქვს თუ არა ჩანაწერი
\`byCategory\`-ში; „აუზი" = რამდენ კანდიდატს ხედავს ამ კატეგორიის საშუალო პროდუქტი.

${table(
  weakest.map(
    (r) =>
      `| ${r.category} | ${r.total} | ${r.avg.toFixed(2)} | ${r.empty} | ${
        r.hasRule ? "კი" : "**არა**"
      } | ${r.pool} |`,
  ),
  ["კატეგორია", "პროდუქტი", "საშ. აქსესუარი", "ცარიელი", "წესი", "აუზი"],
)}
## კატეგორიები წესის გარეშე

ამათთვის \`byCategory\`-ში ჩანაწერი არ არის, ამიტომ ბანდლი საერთოდ არ იგება.
თუ გინდა, რომ აიგოს — დაამატე მწკრივი \`data/accessory-rules.json\`-ში.

${table(
  noRule.map((r) => `| ${r.category} | ${r.total} |`),
  ["კატეგორია", "პროდუქტი"],
)}
## სრული სურათი

${table(
  rows.map(
    (r) =>
      `| ${r.category} | ${r.total} | ${r.avg.toFixed(2)} | ${r.empty} | ${
        r.hasRule ? "კი" : "არა"
      } | ${r.pool} |`,
  ),
  ["კატეგორია", "პროდუქტი", "საშ. აქსესუარი", "ცარიელი", "წესი", "აუზი"],
)}
---

წესების შეცვლის შემდეგ: \`npm run bundles\` (კატალოგი 24 საათი ქეშირებულია,
ხელახლა არ ჩამოიტვირთება). სრული განახლებისთვის \`npm run bundles -- --force\`.
`;

  await fs.mkdir(path.dirname(REPORT_FILE), { recursive: true });
  await fs.writeFile(REPORT_FILE, md, "utf8");
}

main().catch((error) => {
  console.error(String(error.message ?? error));
  process.exit(1);
});
