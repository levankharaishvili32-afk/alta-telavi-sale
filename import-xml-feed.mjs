/**
 * Imports the shop's Google/Meta product feed (RSS 2.0 with the g: namespace)
 * into the site's catalog.
 *
 *   npm run import:feed                          # URL + SKU list from the config below
 *   node scripts/import-xml-feed.mjs <src>       # <src> = URL or local .xml path
 *   node scripts/import-xml-feed.mjs <src> --all # ignore the SKU list, import everything
 *   node scripts/import-xml-feed.mjs <src> --only other-skus.txt
 *
 * Writes data/products.json, data/categories.json and data/filterable-specs.json.
 * Re-runnable: point it at the live feed whenever prices or stock change.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { XMLParser } from "fast-xml-parser";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const DEFAULT_FEED = "https://imgstore.alta.ge/images/alta-product-feed.xml";
const DEFAULT_SKUS = "data/wanted-skus.txt";
/** Prices outside this band are catalog mistakes, not listings. */
const MIN_SANE_PRICE = 5;
const MAX_SANE_PRICE = 50000;

/* ------------------------------------------------------------------ */
/* Arguments                                                           */
/* ------------------------------------------------------------------ */

const argv = process.argv.slice(2);
const flags = new Set(argv.filter((a) => a.startsWith("--")));
const positional = argv.filter((a) => !a.startsWith("--"));
const onlyIdx = argv.indexOf("--only");
const skuFile = onlyIdx !== -1 ? argv[onlyIdx + 1] : DEFAULT_SKUS;
const source = positional.find((a) => a !== skuFile) ?? DEFAULT_FEED;

/* ------------------------------------------------------------------ */
/* Load the feed                                                       */
/* ------------------------------------------------------------------ */

async function loadFeed(src) {
  if (/^https?:\/\//i.test(src)) {
    console.log(`Fetching ${src} …`);
    const res = await fetch(src, {
      headers: { "user-agent": "alta-campaign-importer" },
    });
    if (!res.ok) throw new Error(`feed responded ${res.status} ${res.statusText}`);
    return res.text();
  }
  const path = resolve(root, src);
  if (!existsSync(path)) throw new Error(`no such file: ${path}`);
  console.log(`Reading ${src} …`);
  return readFileSync(path, "utf8");
}

/* ------------------------------------------------------------------ */
/* Field access — tolerant of feeds that drop the g: prefix            */
/* ------------------------------------------------------------------ */

const text = (v) => {
  if (v === undefined || v === null) return null;
  if (typeof v === "object") v = v["#text"] ?? "";
  const s = String(v).trim();
  return s === "" ? null : s;
};

const pick = (item, ...names) => {
  for (const n of names) {
    const v = text(item[n]) ?? text(item[`g:${n}`]);
    if (v !== null) return v;
  }
  return null;
};

/** "1 299.00 GEL" / "1299,00" / "1299" -> 1299 */
function money(raw) {
  if (!raw) return null;
  const m = String(raw).match(/[\d][\d\s.,]*/);
  if (!m) return null;
  const cleaned = m[0].replace(/\s/g, "").replace(/,(\d{2})$/, ".$1").replace(/,/g, "");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

const IN_STOCK = /^(in[\s_-]?stock|available|preorder|available for order|1|true|yes)$/i;

/* ------------------------------------------------------------------ */
/* Category tree, from the slug in each product's shop URL             */
/* ------------------------------------------------------------------ */

const map = JSON.parse(readFileSync(resolve(root, "data/category-map.json"), "utf8"));

const prettify = (slug) =>
  slug.replace(/-/g, " ").replace(/^\w/, (c) => c.toUpperCase());

/** https://alta.ge/mtversasruti/sencor-svc-8825ti-p1234 -> "mtversasruti" */
function slugFromUrl(url) {
  if (!url) return null;
  try {
    const parts = new URL(url).pathname.split("/").filter(Boolean);
    return parts.length >= 2 ? parts[0] : null;
  } catch {
    return null;
  }
}

function placeInTree(url) {
  const slug = slugFromUrl(url);
  if (!slug) return null;
  const entry = map.slugs?.[slug];
  if (entry) {
    return {
      category: { id: entry.group, label: map.groups?.[entry.group] ?? prettify(entry.group) },
      subcategory: { id: slug, label: entry.label },
    };
  }
  // Unmapped slug — give it its own category rather than dropping the product.
  return {
    category: { id: slug, label: prettify(slug) },
    subcategory: { id: slug, label: prettify(slug) },
  };
}

/* ------------------------------------------------------------------ */
/* Brand resolution                                                    */
/* ------------------------------------------------------------------ */

/*
 * Roughly a third of the feed omits g:brand, so it has to come from the title.
 * Taking the first word breaks two-word brands ("Russell Hobbs 24080" ->
 * "Russell"), so match the title against the vocabulary of brands the feed
 * *does* declare elsewhere, longest first. These few are listed explicitly for
 * the case where a trimmed feed doesn't happen to declare them anywhere.
 */
const KNOWN_MULTIWORD_BRANDS = [
  "Russell Hobbs",
  "Home Element",
  "Smart Home",
  "De Longhi",
];

/** "BRAUN" -> "Braun", but "LG" and "JBL" keep their casing. */
function canonicaliseBrand(name) {
  if (name.length > 3 && name === name.toUpperCase())
    return name
      .toLowerCase()
      .replace(/(^|\s|-)(\w)/g, (_, sep, c) => sep + c.toUpperCase());
  return name;
}

function buildBrandVocabulary(allItems) {
  const seen = new Map(); // lowercase -> canonical
  for (const it of allItems) {
    const b = pick(it, "brand", "manufacturer");
    if (b) seen.set(b.toLowerCase(), canonicaliseBrand(b));
  }
  for (const b of KNOWN_MULTIWORD_BRANDS)
    if (!seen.has(b.toLowerCase())) seen.set(b.toLowerCase(), b);
  // Longest first so "Russell Hobbs" wins over a bare "Russell".
  return [...seen.entries()].sort((a, b) => b[0].length - a[0].length);
}

function resolveBrand(item, title, vocabulary) {
  const declared = pick(item, "brand", "manufacturer");
  if (declared) return canonicaliseBrand(declared);
  const lower = title.toLowerCase();
  for (const [key, canonical] of vocabulary)
    if (lower.startsWith(key + " ") || lower === key) return canonical;
  return canonicaliseBrand(title.split(/\s+/)[0]);
}

/* Attribute fields worth exposing as specs when the feed carries them. */
const SPEC_FIELDS = [
  ["color", "ფერი"],
  ["size", "ზომა"],
  ["material", "მასალა"],
  ["pattern", "დიზაინი"],
  ["capacity", "მოცულობა"],
  ["age_group", "ასაკობრივი ჯგუფი"],
  ["gender", "სქესი"],
];

/* ------------------------------------------------------------------ */
/* Main                                                                */
/* ------------------------------------------------------------------ */

const xml = await loadFeed(source);

const parser = new XMLParser({
  ignoreAttributes: false,
  trimValues: true,
  cdataPropName: false,
  parseTagValue: false,
});
const doc = parser.parse(xml);

/* RSS 2.0, Atom, or a bare list of products. */
const rawItems =
  doc?.rss?.channel?.item ??
  doc?.channel?.item ??
  doc?.feed?.entry ??
  doc?.products?.product ??
  doc?.catalog?.item ??
  [];
const items = Array.isArray(rawItems) ? rawItems : [rawItems];
if (!items.length) throw new Error("no <item> elements found — is this a product feed?");
console.log(`Feed contains ${items.length} items.`);

const brandVocabulary = buildBrandVocabulary(items);

let wanted = null;
const skuPath = resolve(root, skuFile);
if (!flags.has("--all") && existsSync(skuPath)) {
  wanted = new Set(
    readFileSync(skuPath, "utf8")
      .split(/\s+/)
      .map((s) => s.trim())
      .filter(Boolean),
  );
  console.log(`Filtering to the ${wanted.size} SKUs in ${skuFile}.`);
}

const products = [];
const skipped = [];
const seenIds = new Set();
const categories = new Map();

for (const item of items) {
  const id = pick(item, "id", "sku", "product_id", "retailer_id", "code");
  if (!id) continue;
  if (wanted && !wanted.has(id)) continue;
  if (seenIds.has(id)) continue;
  seenIds.add(id);

  const title = pick(item, "title", "name");
  const url = pick(item, "link", "url");
  const image = pick(item, "image_link", "image", "picture");

  if (!title) {
    skipped.push({ id, reason: "no title" });
    continue;
  }

  const listPrice = money(pick(item, "price"));
  const salePrice = money(pick(item, "sale_price", "special_price"));
  if (listPrice === null) {
    skipped.push({ id, title, reason: "no price" });
    continue;
  }
  if (listPrice < MIN_SANE_PRICE || listPrice > MAX_SANE_PRICE) {
    skipped.push({
      id,
      title,
      reason: `implausible price ${listPrice} — check it in the feed`,
    });
    continue;
  }

  const place = placeInTree(url);
  if (!place) {
    skipped.push({ id, title, reason: "no category slug in the product URL" });
    continue;
  }

  if (!categories.has(place.category.id))
    categories.set(place.category.id, { ...place.category, subcategories: new Map() });
  categories.get(place.category.id).subcategories.set(place.subcategory.id, place.subcategory);

  const brand = resolveBrand(item, title, brandVocabulary);

  const specs = {};
  for (const [field, label] of SPEC_FIELDS) {
    const value = pick(item, field);
    if (value) specs[label] = value;
  }
  specs["ბრენდი"] = brand;
  const condition = pick(item, "condition");
  if (condition) specs["მდგომარეობა"] = condition === "new" ? "ახალი" : condition;
  specs["გარანტია"] = "24 თვე";

  const gallery = (pick(item, "additional_image_link") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => /^https?:\/\//i.test(s))
    .slice(0, 5);

  products.push({
    id,
    title,
    category: place.category.id,
    subcategory: place.subcategory.id,
    brand,
    image: image ?? "/img/placeholder.svg",
    gallery,
    url: url ?? null,
    old_price: listPrice,
    promo_price: salePrice !== null && salePrice > 0 && salePrice < listPrice ? salePrice : listPrice,
    stock: IN_STOCK.test(pick(item, "availability", "stock") ?? ""),
    specs,
  });
}

/* Largest categories first, then alphabetically inside each. */
const countIn = (id) => products.filter((p) => p.category === id).length;
const categoryList = [...categories.values()]
  .sort((a, b) => countIn(b.id) - countIn(a.id) || a.label.localeCompare(b.label, "ka"))
  .map((c) => ({
    id: c.id,
    label: c.label,
    subcategories: [...c.subcategories.values()].sort((a, b) =>
      a.label.localeCompare(b.label, "ka"),
    ),
  }));

products.sort(
  (a, b) =>
    countIn(b.category) - countIn(a.category) ||
    a.category.localeCompare(b.category) ||
    a.title.localeCompare(b.title, "en"),
);

/* A spec dimension is only worth showing when it has at least two values. */
const filterable = {};
for (const c of categoryList) {
  const scoped = products.filter((p) => p.category === c.id);
  const keys = new Set(scoped.flatMap((p) => Object.keys(p.specs)));
  filterable[c.id] = [...keys]
    .filter((k) => k !== "ბრენდი") // the brand facet covers this already
    .filter((k) => new Set(scoped.map((p) => p.specs[k]).filter(Boolean)).size >= 2);
}

const write = (file, value) =>
  writeFileSync(resolve(root, file), JSON.stringify(value, null, 2) + "\n", "utf8");

write("data/products.json", products);
write("data/categories.json", categoryList);
write("data/filterable-specs.json", filterable);

const discounted = products.filter((p) => p.promo_price < p.old_price);
const inStock = products.filter((p) => p.stock);

console.log(
  `\nImported ${products.length} products into ${categoryList.length} categories.`,
);
console.log(
  `  ${discounted.length} discounted, ${inStock.length} in stock, ` +
    `${Math.min(...products.map((p) => p.promo_price))}–${Math.max(...products.map((p) => p.old_price))} GEL`,
);
for (const c of categoryList) console.log(`  • ${c.label}: ${countIn(c.id)}`);

if (skipped.length) {
  console.log(`\nSkipped ${skipped.length}:`);
  for (const s of skipped) console.log(`  • ${s.id} ${s.title ?? ""} — ${s.reason}`);
}

if (wanted) {
  const missing = [...wanted].filter((s) => !seenIds.has(s));
  if (missing.length) {
    console.log(
      `\n${missing.length} of the ${wanted.size} requested SKUs are not in the feed:`,
    );
    console.log(`  ${missing.join(", ")}`);
    console.log(
      "  (delisted, or filtered out of the feed — check them in the shop admin)",
    );
  }
}
