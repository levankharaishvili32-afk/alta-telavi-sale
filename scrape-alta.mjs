#!/usr/bin/env node
/**
 * scrape-alta.mjs — build data/products.json for the Telavi campaign.
 *
 * Prices are campaign prices and come from data/campaign-products.csv, which this
 * script never writes to. Everything else (Georgian title, images, brand,
 * specifications, breadcrumb) is scraped from alta.ge.
 *
 * How a CSV id reaches a product page
 * ----------------------------------
 * The id in the CSV is alta.ge's *barCode*, not the numeric id that appears in
 * the product URL (`…-p29624`), so a URL cannot be built from the id alone.
 * The search API resolves one to the other:
 *
 *     GET https://api.alta.ge/v1/Products/search?name=<csv id>
 *       → { products: [ { barCode, name, route, id }, … ] }
 *
 * Match on `barCode === id` (the endpoint is a fuzzy search — never trust the
 * first row) and the `route` gives `https://alta.ge/<route>`.
 *
 * What the product page yields
 * ----------------------------
 * alta.ge is a Next.js app, so the page ships a `#__NEXT_DATA__` JSON blob with
 * the whole product record already structured — no HTML scraping needed for the
 * happy path. Order of preference:
 *
 *   1. `#__NEXT_DATA__` → props.pageProps.initialProductData.product
 *   2. `application/ld+json` Product + BreadcrumbList
 *   3. cheerio over the rendered HTML
 *
 * Caching
 * -------
 * Every network response is cached under .cache/ so re-runs are free and the
 * script is safe to interrupt:
 *
 *   .cache/search/<id>.json     raw search response
 *   .cache/pages/<id>.html      raw product page HTML
 *   .cache/products/<id>.json   the extracted record (what the merge reads)
 *
 * A `.cache/products/<id>.json` that already exists short-circuits both network
 * calls for that id. Delete it, or pass --refresh, to re-fetch.
 *
 * Usage
 * -----
 *   npm run scrape                 all ids in the CSV
 *   npm run scrape -- --probe      3 ids across categories, prints what it found
 *   npm run scrape -- --only 145224,132495
 *   npm run scrape -- --limit 25
 *   npm run scrape -- --refresh    ignore cached pages and re-fetch
 *   npm run scrape -- --no-images  skip the image download, keep remote URLs
 *
 * Run `npm run specs` afterwards. This script writes raw scraped keys; that one
 * folds them onto the canonical vocabulary the comparison table reads.
 */

import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as cheerio from "cheerio";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CSV = path.join(ROOT, "data", "campaign-products.csv");
const CACHE = path.join(ROOT, ".cache");
const IMAGE_ROOT = path.join(ROOT, "public", "products");
const REPORT = path.join(ROOT, "reports", "scrape-report.md");

const SEARCH_API = "https://api.alta.ge/v1/Products/search";
const SITE = "https://alta.ge";
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

/** alta.ge only ever renders this one size; there is no 800/1200 variant. */
const IMAGE_SIZE_DIR = "400";

// ---------------------------------------------------------------- arguments

function parseArgs(argv) {
  const flags = {
    probe: false,
    refresh: false,
    images: true,
    limit: Infinity,
    only: null,
    fromFeed: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--probe") flags.probe = true;
    else if (arg === "--refresh") flags.refresh = true;
    else if (arg === "--no-images") flags.images = false;
    else if (arg === "--from-feed") flags.fromFeed = true;
    else if (arg === "--limit") flags.limit = Number(argv[++i]);
    else if (arg === "--only")
      flags.only = new Set(
        String(argv[++i])
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
      );
    else if (arg.startsWith("--"))
      throw new Error(`უცნობი დროშა: ${arg}`);
  }
  return flags;
}

// ------------------------------------------------------------------- utils

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * alta.ge's own data is hand-entered, so titles and spec labels arrive with
 * trailing spaces, doubled spaces, tabs and non-breaking spaces. Left alone
 * these produce near-duplicate facet keys ("ვიდეო გარჩევადობა" and
 * "ვიდეო გარჩევადობა ") that render as two separate filters.
 */
function clean(value) {
  if (typeof value !== "string") return value;
  return value.replace(/[\s ]+/g, " ").trim();
}

/** 300–500ms between requests, as a courtesy to the origin. */
const politeDelay = () => sleep(300 + Math.floor(Math.random() * 200));

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

async function readJson(file) {
  try {
    return JSON.parse(await fs.readFile(file, "utf8"));
  } catch {
    return null;
  }
}

async function writeJson(file, value) {
  await ensureDir(path.dirname(file));
  await fs.writeFile(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

/**
 * fetch with three attempts and exponential backoff. Returns null rather than
 * throwing so one dead product never aborts a 347-product run.
 */
async function fetchWithRetry(url, { binary = false, attempts = 3 } = {}) {
  let lastError = null;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const res = await fetch(url, {
        headers: {
          "User-Agent": UA,
          Accept: binary ? "*/*" : "text/html,application/json;q=0.9",
          "Accept-Language": "ka,en;q=0.8",
        },
        redirect: "follow",
      });
      if (res.status === 404) return { notFound: true };
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return binary
        ? { buffer: Buffer.from(await res.arrayBuffer()), type: res.headers.get("content-type") }
        : { text: await res.text() };
    } catch (error) {
      lastError = error;
      if (attempt < attempts) await sleep(600 * 2 ** (attempt - 1));
    }
  }
  return { error: lastError ? String(lastError.message ?? lastError) : "unknown" };
}

// ---------------------------------------------------------------------- CSV

/** Minimal RFC-4180 reader — the CSV has quoted titles containing commas. */
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else quoted = false;
      } else field += ch;
      continue;
    }
    if (ch === '"') quoted = true;
    else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (ch !== "\r") field += ch;
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  // Excel writes a UTF-8 BOM; it would otherwise become part of the first key.
  if (rows.length) rows[0][0] = rows[0][0].replace(/^﻿/, "");
  const header = rows.shift().map((h) => h.trim());
  return rows
    .filter((r) => r.some((cell) => cell.trim() !== ""))
    .map((r) => Object.fromEntries(header.map((h, i) => [h, (r[i] ?? "").trim()])));
}

// ------------------------------------------------------------- extraction

/** The Next.js payload — richest source, present on every product page. */
function fromNextData(html) {
  const $ = cheerio.load(html);
  const raw = $("#__NEXT_DATA__").html();
  if (!raw) return null;
  let product;
  try {
    product = JSON.parse(raw)?.props?.pageProps?.initialProductData?.product;
  } catch {
    return null;
  }
  if (!product || !product.name) return null;

  const specs = {};
  const addSpec = (name, meaning) => {
    const key = clean(name);
    const value = clean(meaning == null ? "" : String(meaning));
    if (!key || !value) return;
    // Trimming can collapse two variants of the same label onto one key; the
    // first (specification-group order) wins.
    specs[key] ??= value;
  };
  for (const group of product.specificationGroup ?? []) {
    for (const spec of group.specifications ?? []) {
      addSpec(spec.specificationName, spec.specificationMeaning);
    }
  }
  for (const spec of product.mainSpecification ?? []) {
    addSpec(spec.specificationName, spec.specificationMeaning);
  }

  return {
    source: "__NEXT_DATA__",
    pid: product.id ?? null,
    barCode: product.barCode != null ? String(product.barCode) : null,
    title: clean(product.name),
    brand: clean(product.brandName) || specs["ბრენდი"] || null,
    description:
      typeof product.description === "string" && clean(product.description)
        ? clean(product.description)
        : null,
    images: (product.images?.length ? product.images : [product.imageUrl]).filter(Boolean),
    breadcrumbs: (product.breadcrumbs ?? [])
      .map((b) => clean(b.name))
      .filter(Boolean),
    categoryName: clean(product.categoryName) || null,
    parentCategoryName: clean(product.parentCategoryName) || null,
    stock: Number(product.storageQuantity ?? 0) > 0,
    specs,
    specGroups: (product.specificationGroup ?? []).map((g) => ({
      group: clean(g.groupName),
      keys: (g.specifications ?? [])
        .map((s) => clean(s.specificationName))
        .filter(Boolean),
    })),
  };
}

/** schema.org fallback — name, brand, sku, images, breadcrumb, but no specs. */
function fromJsonLd(html) {
  const $ = cheerio.load(html);
  const blocks = [];
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const parsed = JSON.parse($(el).contents().text());
      blocks.push(...(Array.isArray(parsed) ? parsed : [parsed]));
    } catch {
      /* a malformed block should not sink the page */
    }
  });
  const product = blocks.find((b) => b?.["@type"] === "Product");
  if (!product?.name) return null;
  const crumbs = blocks.find((b) => b?.["@type"] === "BreadcrumbList");

  return {
    source: "ld+json",
    pid: null,
    barCode: product.sku != null ? String(product.sku) : null,
    title: product.name,
    brand: product.brand?.name ?? null,
    description: typeof product.description === "string" ? product.description.trim() : null,
    images: (Array.isArray(product.image) ? product.image : [product.image])
      .map((img) => (typeof img === "string" ? img : img?.url))
      .filter(Boolean),
    breadcrumbs: (crumbs?.itemListElement ?? [])
      .map((e) => e.name ?? e.item?.name)
      .filter(Boolean)
      .slice(1, -1),
    categoryName: null,
    parentCategoryName: null,
    stock: /InStock/i.test(product.offers?.availability ?? ""),
    specs: product.brand?.name ? { ბრენდი: product.brand.name } : {},
    specGroups: [],
  };
}

/** Last resort: read the rendered DOM. */
function fromHtml(html) {
  const $ = cheerio.load(html);
  const title = $("h1").first().text().trim();
  if (!title) return null;

  const specs = {};
  $("table tr").each((_, tr) => {
    const cells = $(tr).find("td,th");
    if (cells.length === 2) {
      const key = $(cells[0]).text().trim();
      const value = $(cells[1]).text().trim();
      if (key && value) specs[key] = value;
    }
  });
  $("dl").each((_, dl) => {
    const dts = $(dl).find("dt");
    const dds = $(dl).find("dd");
    dts.each((i, dt) => {
      const key = $(dt).text().trim();
      const value = $(dds[i]).text().trim();
      if (key && value) specs[key] = value;
    });
  });

  const images = [];
  $("img").each((_, img) => {
    const src = $(img).attr("src") ?? $(img).attr("data-src") ?? "";
    if (/imgstore\.alta\.ge/i.test(src)) images.push(src);
  });

  return {
    source: "html",
    pid: null,
    barCode: null,
    title,
    brand: specs["ბრენდი"] ?? null,
    description: null,
    images: [...new Set(images)],
    breadcrumbs: $('[class*="readcrumb"] a')
      .map((_, a) => $(a).text().trim())
      .get()
      .filter(Boolean)
      .slice(1),
    categoryName: null,
    parentCategoryName: null,
    stock: true,
    specs,
    specGroups: [],
  };
}

function extract(html) {
  return fromNextData(html) ?? fromJsonLd(html) ?? fromHtml(html);
}

// ----------------------------------------------------------------- scraping

/** CSV id → { route, name } via the fuzzy search endpoint, matched on barCode. */
async function resolveRoute(id, flags) {
  const cacheFile = path.join(CACHE, "search", `${id}.json`);
  let payload = flags.refresh ? null : await readJson(cacheFile);

  if (!payload) {
    await politeDelay();
    const res = await fetchWithRetry(`${SEARCH_API}?name=${encodeURIComponent(id)}`);
    if (res.error) return { error: `search failed: ${res.error}` };
    if (res.notFound) return { error: "search returned 404" };
    try {
      payload = JSON.parse(res.text);
    } catch {
      return { error: "search returned malformed JSON" };
    }
    await ensureDir(path.dirname(cacheFile));
    await fs.writeFile(cacheFile, JSON.stringify(payload), "utf8");
  }

  const hit = (payload.products ?? []).find((p) => String(p.barCode) === String(id));
  if (!hit) return { error: "not found on alta.ge" };
  return { route: hit.route, name: hit.name };
}

async function fetchPage(id, route, flags) {
  const cacheFile = path.join(CACHE, "pages", `${id}.html`);
  if (!flags.refresh && existsSync(cacheFile)) {
    return { html: await fs.readFile(cacheFile, "utf8") };
  }
  await politeDelay();
  const res = await fetchWithRetry(`${SITE}/${route}`);
  if (res.error) return { error: `page fetch failed: ${res.error}` };
  if (res.notFound) return { error: "product page returned 404" };
  await ensureDir(path.dirname(cacheFile));
  await fs.writeFile(cacheFile, res.text, "utf8");
  return { html: res.text };
}

/**
 * Whitespace tidying applied on the way *out* of the cache as well as on the
 * way in, so a cache written before this rule existed still yields clean data
 * without forcing a full --refresh.
 */
function tidyRecord(record) {
  const specs = {};
  for (const [key, value] of Object.entries(record.specs ?? {})) {
    const k = clean(key);
    const v = clean(String(value ?? ""));
    if (k && v) specs[k] ??= v;
  }
  return {
    ...record,
    title: clean(record.title),
    brand: clean(record.brand) || null,
    description: clean(record.description) || null,
    breadcrumbs: (record.breadcrumbs ?? []).map(clean).filter(Boolean),
    categoryName: clean(record.categoryName) || null,
    specs,
  };
}

/**
 * A product record assembled from `data/alta-catalog.json` — the Meta product
 * feed `npm run bundles` already keeps — instead of from the product page.
 *
 * The feed carries the name, brand, image and canonical URL, which is enough
 * for a product to appear correctly in the grid and on its own page. What it
 * does not carry is specifications, so a feed-built product has none: it shows
 * no attribute rows and cannot be usefully compared until a real scrape fills
 * it in. Deliberately *not* written to `.cache/products/`, so the next run with
 * alta.ge reachable scrapes it properly rather than finding a cached stand-in;
 * `reports/scrape-report.md` lists everything still in this state.
 *
 * Enabled with `--from-feed`, never automatically: a silent downgrade from
 * "scraped" to "the feed said so" is exactly the kind of thing that should be
 * asked for out loud.
 */
/**
 * The feed leaves `brand` null on about a third of its rows, and a product
 * filed under "სხვა" is invisible to the brand facet — which is how somebody
 * looking for a Russell Hobbs kettle fails to find one that is right there.
 *
 * The names are in the titles, so this reads them back out: the longest brand
 * the feed itself uses anywhere that this title starts with. Vocabulary from
 * the data, no hardcoded list, and "Russell Hobbs" beats "Russell" because
 * longer wins.
 */
function guessBrand(title, vocabulary) {
  const lower = String(title ?? "").toLowerCase();
  let best = null;
  for (const brand of vocabulary) {
    if (!lower.startsWith(brand.toLowerCase())) continue;
    if (!best || brand.length > best.length) best = brand;
  }
  if (best) return best;

  // Nothing in the vocabulary matched, which happens for a brand alta.ge
  // stocks but never labels — Smarton, for one. Titles here are written
  // "<Brand> <model>", so the first word is the brand as long as it reads like
  // a name and not like a part number: letters only, and more than two of them.
  const first = String(title ?? "").trim().split(/\s+/)[0] ?? "";
  return /^[A-Za-z][A-Za-z'&-]{2,}$/.test(first) ? first : null;
}

function fromFeed(id, feed) {
  const item = feed.get(String(id));
  if (!item) return null;
  return {
    id: String(id),
    title: clean(item.name),
    brand: clean(item.brand) || guessBrand(item.name, feed.brands) || null,
    description: null,
    breadcrumbs: [],
    categoryName: item.category_slug ?? null,
    specs: {},
    images: normaliseImages([item.image_url]),
    url: item.url ?? null,
    route: null,
    source: "feed",
  };
}

/** Full record for one CSV id. Cached end-to-end in .cache/products/<id>.json. */
async function scrapeOne(id, flags, feed) {
  const recordFile = path.join(CACHE, "products", `${id}.json`);
  if (!flags.refresh) {
    const cached = await readJson(recordFile);
    if (cached) return { ...tidyRecord(cached), cached: true };
  }

  const resolved = await resolveRoute(id, flags);
  if (resolved.error) {
    const fallback = flags.fromFeed && feed ? fromFeed(id, feed) : null;
    return fallback ?? { id, error: resolved.error };
  }

  const page = await fetchPage(id, resolved.route, flags);
  if (page.error) {
    const fallback = flags.fromFeed && feed ? fromFeed(id, feed) : null;
    return fallback ?? { id, error: page.error, route: resolved.route };
  }

  const data = extract(page.html);
  if (!data) return { id, error: "no parseable product data on page", route: resolved.route };

  // A route can go stale and land on a different product; barCode proves identity.
  if (data.barCode && data.barCode !== String(id)) {
    return { id, error: `route resolved to barCode ${data.barCode}`, route: resolved.route };
  }

  const record = {
    ...data,
    id: String(id),
    route: resolved.route,
    url: `${SITE}/${resolved.route}`,
    images: normaliseImages(data.images),
  };
  await writeJson(recordFile, record);
  return record;
}

/** De-dupe, force the one rendition alta.ge actually serves, absolute URLs. */
function normaliseImages(images) {
  const seen = new Set();
  const out = [];
  for (const raw of images ?? []) {
    if (!raw) continue;
    let url = String(raw).trim();
    if (url.startsWith("//")) url = `https:${url}`;
    if (!/^https?:/i.test(url)) continue;
    url = url.replace(
      /(imgstore\.alta\.ge\/images\/)\d+(\/)/i,
      `$1${IMAGE_SIZE_DIR}$2`,
    );
    if (seen.has(url)) continue;
    seen.add(url);
    out.push(url);
  }
  return out;
}

// ------------------------------------------------------------------ images

async function downloadImages(id, urls) {
  if (!urls.length) return { local: [], failed: [] };
  const dir = path.join(IMAGE_ROOT, id);
  await ensureDir(dir);
  const local = [];
  const failed = [];

  for (let i = 0; i < urls.length; i += 1) {
    const url = urls[i];
    const ext = (url.match(/\.(webp|jpe?g|png|avif|gif)(?:\?|$)/i)?.[1] ?? "webp").toLowerCase();
    // Hash the URL into the name so a changed source image produces a new file
    // instead of silently reusing a stale one.
    const stamp = createHash("sha1").update(url).digest("hex").slice(0, 8);
    const file = `${String(i + 1).padStart(2, "0")}-${stamp}.${ext}`;
    const abs = path.join(dir, file);
    const rel = `/products/${id}/${file}`;

    if (existsSync(abs)) {
      local.push(rel);
      continue;
    }
    await politeDelay();
    const res = await fetchWithRetry(url, { binary: true });
    if (res.error || res.notFound || !res.buffer?.length) {
      failed.push(url);
      continue;
    }
    await fs.writeFile(abs, res.buffer);
    local.push(rel);
  }
  return { local, failed };
}

// ------------------------------------------------------------------- merge

/**
 * Category ids end up in `?cat=` / `?sub=`, so they stay ascii. Georgian CSV
 * values that have no entry in csv-category-map.json fall back to a stable
 * hash suffix rather than percent-encoded Georgian in the URL bar.
 */
const slug = (value) => {
  const ascii = String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (ascii) return ascii;
  return `c-${createHash("sha1").update(String(value)).digest("hex").slice(0, 6)}`;
};

function toNumber(value) {
  const n = Number(String(value).replace(/[^\d.,-]/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

function discountPct(oldPrice, promoPrice) {
  if (!oldPrice || promoPrice == null || promoPrice >= oldPrice) return 0;
  return Math.round(((oldPrice - promoPrice) / oldPrice) * 100);
}

/**
 * Spec keys that describe one specific unit rather than a shared trait. They
 * pass every statistical test in a small subcategory — every product has one,
 * and there are only a handful of distinct values — but nobody filters a shop
 * by part number.
 */
const NON_FACET_SPECS = new Set([
  // Brand is a first-class product field with its own facet; offering it a
  // second time as a spec renders two identical "ბრენდი" panels.
  "ბრენდი",
  "მოდელი/PN",
  "მოდელი",
  "სერია",
  "შტრიხკოდი",
  "გამოყენებული მასალა",
  "კომპლექტაცია",
  "ზომები (სიმაღლე x სიგანე x სიღრმე)",
  "წონა",
]);

/**
 * Specs worth exposing as filters: present on at least 60% of a scope's
 * products and with 2–8 distinct values, so the facet is both broadly
 * applicable and short enough to render.
 *
 * Keyed twice — once per category ("it") and once per category/subcategory
 * ("it/mouse"). A campaign this wide has almost nothing in common across a
 * whole group, so the useful dimensions only appear once a subcategory is
 * picked; the UI prefers the narrower key when one is selected.
 */
function buildFilterableSpecs(products) {
  const scopes = new Map();
  const push = (key, product) => {
    if (!scopes.has(key)) scopes.set(key, []);
    scopes.get(key).push(product);
  };
  for (const product of products) {
    push(product.category, product);
    push(`${product.category}/${product.subcategory}`, product);
  }

  const result = {};
  for (const [scope, items] of scopes) {
    if (items.length < 3) {
      result[scope] = [];
      continue;
    }
    const counts = new Map();
    for (const item of items) {
      for (const [key, value] of Object.entries(item.specs ?? {})) {
        if (!counts.has(key)) counts.set(key, { n: 0, values: new Set() });
        const entry = counts.get(key);
        entry.n += 1;
        entry.values.add(value);
      }
    }
    result[scope] = [...counts.entries()]
      .filter(([key, e]) => {
        if (NON_FACET_SPECS.has(key)) return false;
        // Selected values ride in the URL comma-separated, so a value that
        // already contains a comma cannot round-trip.
        if ([...e.values].some((v) => v.includes(","))) return false;
        if (e.n < items.length * 0.6) return false;
        if (e.values.size < 2 || e.values.size > 8) return false;
        // A facet has to actually group: as many distinct values as products
        // means it is an identifier, not a shared trait.
        return e.values.size <= e.n / 1.5;
      })
      .sort((a, b) => b[1].n - a[1].n || a[0].localeCompare(b[0], "ka"))
      .slice(0, 6)
      .map(([key]) => key);
  }
  return Object.fromEntries(
    Object.keys(result)
      .sort((a, b) => a.localeCompare(b))
      .map((k) => [k, result[k]]),
  );
}

// ------------------------------------------------------------------ report

async function writeReport({ rows, results, flags, started, excluded }) {
  const failed = [];
  const notFound = [];
  const noImages = [];
  const ok = [];

  for (const r of results) {
    if (r.error === "not found on alta.ge") notFound.push(r);
    else if (r.error) failed.push(r);
    else if (!r.images?.length) {
      noImages.push(r);
      ok.push(r);
    } else ok.push(r);
  }

  const excludedRows = rows.filter((r) => excluded?.has(r.id));
  const imageFailures = results.filter((r) => r.imageFailures?.length);
  // Built from the Meta feed because alta.ge could not be reached. They render
  // correctly but carry no specifications, so they cannot be compared and no
  // spec filter finds them — the list below is the to-do for the next run.
  const feedBuilt = results.filter((r) => r.source === "feed");
  const table = (list, cols) =>
    list.length
      ? [
          `| ${cols.join(" | ")} |`,
          `| ${cols.map(() => "---").join(" | ")} |`,
          ...list,
          "",
        ].join("\n")
      : "_არცერთი._\n";

  const titleOf = (id) => rows.find((r) => r.id === id)?.title ?? "";

  // The CSV flags rows whose two price columns disagreed with its own source.
  // The prices are still used verbatim — the flag is surfaced, not acted on.
  const conflicts = rows.filter(
    (r) => String(r.price_conflict).toLowerCase() === "true",
  );

  const md = `# alta.ge სქრეიპის ანგარიში

დაწყება: ${started}
რეჟიმი: ${flags.probe ? "probe" : "full"}${flags.refresh ? " + refresh" : ""}${flags.images ? "" : " + no-images"}

| მაჩვენებელი | რაოდენობა |
| --- | --- |
| CSV-ში სულ | ${rows.length} |
| დამუშავებული | ${results.length} |
| წარმატებული | ${ok.length} |
| ვერ მოიძებნა alta.ge-ზე | ${notFound.length} |
| შეცდომით დასრულდა | ${failed.length} |
| ფოტოს გარეშე | ${noImages.length} |
| ფიდიდან აღდგენილი (მახასიათებლების გარეშე) | ${feedBuilt.length} |
| ხელით ამოღებული (excluded-products.json) | ${excludedRows.length} |
| CSV-ში ფასის კონფლიქტით მონიშნული | ${conflicts.length} |

## ხელით ამოღებული (${excludedRows.length})

ეს პროდუქტები ფასების ფაილშია, საიტზე კი განზრახ არ ხვდება —
\`data/excluded-products.json\`-ის მიხედვით. დასაბრუნებლად წაშალეთ იქიდან
შესაბამისი სტრიქონი და თავიდან გაუშვით \`npm run scrape\`.

${table(
  excludedRows.map((r) => `| ${r.id} | ${r.title.replace(/\|/g, "/")} | ${String(excluded.get(r.id) ?? "").replace(/\|/g, "/")} |`),
  ["კოდი", "CSV დასახელება", "მიზეზი"],
)}
## ფიდიდან აღდგენილი (${feedBuilt.length})

alta.ge მიუწვდომელი იყო, ამიტომ ეს პროდუქტები \`data/alta-catalog.json\`-იდან
აიწყო: დასახელება, ბრენდი, ფოტო და ბმული სწორია, **მახასიათებლები კი არ აქვთ** —
შესაბამისად შედარების ცხრილში ცარიელია და მახასიათებლების ფილტრი მათ ვერ პოულობს.
შემდეგი \`npm run scrape\`, როცა alta.ge ხელმისაწვდომია, ავტომატურად ჩაანაცვლებს.

${table(
  feedBuilt.map((r) => `| ${r.id} | ${(r.title ?? "").replace(/\|/g, "/")} |`),
  ["კოდი", "დასახელება"],
)}
## ვერ მოიძებნა alta.ge-ზე (${notFound.length})

საძიებო API-მ ამ კოდებზე დამთხვევა ვერ დააბრუნა — პროდუქტი სავარაუდოდ მოხსნილია საიტიდან.

${table(
  notFound.map((r) => `| ${r.id} | ${titleOf(r.id).replace(/\|/g, "/")} |`),
  ["კოდი", "CSV დასახელება"],
)}
## შეცდომით დასრულდა (${failed.length})

${table(
  failed.map(
    (r) => `| ${r.id} | ${titleOf(r.id).replace(/\|/g, "/")} | ${r.error} |`,
  ),
  ["კოდი", "CSV დასახელება", "მიზეზი"],
)}
## ფოტოს გარეშე (${noImages.length})

${table(
  noImages.map((r) => `| ${r.id} | ${(r.title ?? "").replace(/\|/g, "/")} | ${r.url ?? ""} |`),
  ["კოდი", "დასახელება", "გვერდი"],
)}
## ფოტოს ჩამოტვირთვა ვერ მოხერხდა (${imageFailures.length})

${table(
  imageFailures.map((r) => `| ${r.id} | ${r.imageFailures.length} | ${r.imageFailures[0]} |`),
  ["კოდი", "ვერ ჩამოიტვირთა", "პირველი URL"],
)}
## CSV-ში ფასის კონფლიქტით მონიშნული (${conflicts.length})

ამ სტრიქონებს თავად CSV-ს სვეტი \`price_conflict\` ნიშნავს. ფასები მაინც CSV-დან
აიღება უცვლელად — სია მხოლოდ იმისთვისაა, რომ ხელით გადაამოწმო.

${table(
  conflicts.map(
    (r) =>
      `| ${r.id} | ${r.title.replace(/\|/g, "/")} | ${r.old_price} | ${r.promo_price} |`,
  ),
  ["კოდი", "დასახელება", "ძველი ფასი", "აქციის ფასი"],
)}
---

განმეორებითი გაშვება: \`npm run scrape\` — ყველა პასუხი ქეშირებულია \`.cache/\`-ში,
ამიტომ ხელახლა გაშვება მხოლოდ იმას ჩამოტვირთავს, რაც აკლია. სრული განახლებისთვის:
\`npm run scrape -- --refresh\`.
`;

  await ensureDir(path.dirname(REPORT));
  await fs.writeFile(REPORT, md, "utf8");
  return { ok, failed, notFound, noImages, imageFailures };
}

// -------------------------------------------------------------------- main

async function main() {
  const flags = parseArgs(process.argv.slice(2));
  const started = new Date().toISOString().replace("T", " ").slice(0, 16);

  const rows = parseCsv(await fs.readFile(CSV, "utf8"));
  const labels = await readJson(path.join(ROOT, "data", "csv-category-map.json"));
  const groupMap = labels?.groups ?? {};
  const categoryLabels = labels?.categories ?? {};
  const categorySlugs = labels?.categorySlugs ?? {};

  const groupSlug = (group) => groupMap[group]?.slug ?? slug(group);
  const groupLabel = (group) => groupMap[group]?.label ?? group;
  const catSlug = (category) => categorySlugs[category] ?? slug(category);
  const catLabel = (category) => categoryLabels[category] ?? category;

  let queue = rows;
  if (flags.only) queue = queue.filter((r) => flags.only.has(r.id));
  if (flags.probe) {
    // One id from each CSV group, so the confirmation spans categories.
    const seen = new Set();
    queue = rows.filter((r) => {
      if (seen.has(r.group) || seen.size >= 3) return false;
      seen.add(r.group);
      return true;
    });
  }
  if (Number.isFinite(flags.limit)) queue = queue.slice(0, flags.limit);

  console.log(`დასამუშავებელი: ${queue.length} / ${rows.length}`);

  /** retailer_id → feed item, only when --from-feed asked for it. */
  let feed = null;
  if (flags.fromFeed) {
    const catalog = await readJson(path.join(ROOT, "data", "alta-catalog.json"));
    feed = new Map(
      (catalog?.products ?? []).map((p) => [String(p.retailer_id), p]),
    );
    // Every brand the feed names anywhere, for the rows where it names none.
    feed.brands = [
      ...new Set(
        (catalog?.products ?? []).map((p) => clean(p.brand)).filter(Boolean),
      ),
    ];
    console.log(
      `--from-feed: data/alta-catalog.json — ${feed.size} ჩანაწერი, ` +
        `${feed.brands.length} ბრენდი`,
    );
  }

  const results = [];
  for (const [index, row] of queue.entries()) {
    const record = await scrapeOne(row.id, flags, feed);
    if (!record.error && flags.images) {
      const { local, failed } = await downloadImages(row.id, record.images);
      record.localImages = local;
      record.imageFailures = failed;
    }
    results.push(record);

    const mark = record.error
      ? "✗"
      : record.cached
        ? "·"
        : record.source === "feed"
          ? "~"
          : "✓";
    process.stdout.write(
      `${mark} ${String(index + 1).padStart(3)}/${queue.length} ${row.id} ${
        record.error ?? `${record.title} (${record.images.length} ფოტო)`
      }\n`,
    );
  }

  if (flags.probe) {
    console.log("\n--- probe ---");
    for (const r of results) {
      if (r.error) {
        console.log(`${r.id}: ${r.error}`);
        continue;
      }
      console.log(
        [
          `${r.id} → ${r.url}`,
          `  source:      ${r.source}`,
          `  title:       ${r.title}`,
          `  brand:       ${r.brand}`,
          `  breadcrumb:  ${r.breadcrumbs.join(" › ")}`,
          `  images:      ${r.images.length}`,
          `  specs:       ${Object.keys(r.specs).length} (${Object.keys(r.specs)
            .slice(0, 4)
            .join(", ")}…)`,
        ].join("\n"),
      );
    }
    console.log("\nprobe რეჟიმი — products.json არ განახლებულა.");
    return;
  }

  // ---- merge: prices from the CSV, everything else from the scrape --------

  const byId = new Map(results.map((r) => [String(r.id), r]));

  /*
   * Products held off the site by hand, from data/excluded-products.json.
   *
   * Applied here rather than by deleting a CSV row, because a CSV row does not
   * stay deleted: the CSV is rebuilt from whatever workbook the commercial team
   * sends next, and the product would silently return. Filtering at the point
   * products.json is written means one list governs the site, the feed, the
   * search index and everything else downstream.
   */
  const excludedFile = await readJson(
    path.join(ROOT, "data", "excluded-products.json"),
  );
  const excluded = new Map(Object.entries(excludedFile?.excluded ?? {}));

  /*
   * What a partial run must not do is delete everything it did not look at.
   * `--only`, `--limit` and `--probe` all narrow the queue, and this merge
   * writes the whole of products.json — so without this, `--only 161393` would
   * leave the site with exactly one product. Anything already written and not
   * re-scraped this run is carried over, with its prices and category taken
   * from the CSV as usual, because those are the CSV's to decide.
   */
  const partial = flags.only || flags.probe || Number.isFinite(flags.limit);
  const previous = partial
    ? new Map(
        ((await readJson(path.join(ROOT, "data", "products.json"))) ?? []).map(
          (p) => [String(p.id), p],
        ),
      )
    : new Map();

  const products = [];

  for (const row of rows) {
    if (excluded.has(row.id)) continue;

    const oldPrice = toNumber(row.old_price);
    const promoPrice = toNumber(row.promo_price);
    if (oldPrice == null || promoPrice == null) continue;

    const scraped = byId.get(row.id);
    if (!scraped || scraped.error) {
      const kept = previous.get(row.id);
      if (kept)
        products.push({
          ...kept,
          category: groupSlug(row.group),
          subcategory: catSlug(row.category),
          old_price: oldPrice,
          promo_price: promoPrice,
          discount_pct: discountPct(oldPrice, promoPrice),
        });
      continue;
    }

    const images = scraped.localImages?.length ? scraped.localImages : scraped.images;

    products.push({
      id: row.id,
      title: scraped.title,
      category: groupSlug(row.group),
      subcategory: catSlug(row.category),
      brand: scraped.brand ?? scraped.specs?.["ბრენდი"] ?? "სხვა",
      image: images[0] ?? "/img/placeholder.svg",
      gallery: images.slice(1),
      url: scraped.url,
      // authoritative campaign prices — never taken from alta.ge
      old_price: oldPrice,
      promo_price: promoPrice,
      discount_pct: discountPct(oldPrice, promoPrice),
      stock: scraped.stock !== false,
      specs: scraped.specs ?? {},
      // secondary, informational: where the product sits in alta.ge's own tree
      alta_breadcrumb: scraped.breadcrumbs ?? [],
      alta_category: scraped.categoryName ?? null,
      description: scraped.description ?? null,
    });
  }

  // ---- categories -------------------------------------------------------

  // Built from `products` rather than from the CSV rows, so it lists exactly
  // the buckets that have something in them — and so a partial run does not
  // drop the categories of the products it carried over untouched.
  const rowById = new Map(rows.map((r) => [r.id, r]));
  const tree = new Map();
  for (const product of products) {
    const row = rowById.get(product.id);
    if (!row) continue;
    const catId = groupSlug(row.group);
    if (!tree.has(catId))
      tree.set(catId, { id: catId, label: groupLabel(row.group), subcategories: new Map() });
    const subId = catSlug(row.category);
    tree.get(catId).subcategories.set(subId, { id: subId, label: catLabel(row.category) });
  }
  const categories = [...tree.values()].map((c) => ({
    id: c.id,
    label: c.label,
    subcategories: [...c.subcategories.values()].sort((a, b) =>
      a.label.localeCompare(b.label, "ka"),
    ),
  }));

  await writeJson(path.join(ROOT, "data", "products.json"), products);
  await writeJson(path.join(ROOT, "data", "categories.json"), categories);
  await writeJson(
    path.join(ROOT, "data", "filterable-specs.json"),
    buildFilterableSpecs(products),
  );

  const summary = await writeReport({ rows, results, flags, started, excluded });

  console.log(
    `\nჩაწერილია data/products.json — ${products.length} პროდუქტი, ` +
      `${categories.length} კატეგორია.\n` +
      `ვერ მოიძებნა: ${summary.notFound.length}, შეცდომა: ${summary.failed.length}, ` +
      `ფოტოს გარეშე: ${summary.noImages.length}.\n` +
      `ანგარიში: reports/scrape-report.md`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
