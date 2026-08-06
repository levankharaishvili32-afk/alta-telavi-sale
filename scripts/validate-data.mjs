/**
 * Sanity-checks data/products.json against data/categories.json.
 * Run with: npm run validate:data
 */
import { readFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => JSON.parse(readFileSync(resolve(root, p), "utf8"));

const categories = read("data/categories.json");
const products = read("data/products.json");
const filterableSpecs = read("data/filterable-specs.json");

/**
 * Only spec keys offered as filters have to survive the URL round-trip, so the
 * comma rule below is scoped to those — and scoped per product, since a key can
 * be a clean facet for monitors and a prose blob for phones. A display-only
 * value like "64-bit WEP, 128-bit WEP, WPA2-PSK" is fine on the detail page.
 */
const filterableKeysFor = (p) =>
  new Set([
    ...(filterableSpecs[p.category] ?? []),
    ...(filterableSpecs[`${p.category}/${p.subcategory}`] ?? []),
  ]);

const errors = [];
const warnings = [];
const seen = new Set();

const catById = new Map(categories.map((c) => [c.id, c]));

for (const [i, p] of products.entries()) {
  const where = `products[${i}] (${p.id ?? "no id"})`;

  for (const field of [
    "id",
    "title",
    "category",
    "subcategory",
    "brand",
    "image",
    "old_price",
    "promo_price",
    "stock",
    "specs",
  ]) {
    if (p[field] === undefined) errors.push(`${where}: missing "${field}"`);
  }

  if (seen.has(p.id)) errors.push(`${where}: duplicate id`);
  seen.add(p.id);

  const cat = catById.get(p.category);
  if (!cat) {
    errors.push(`${where}: unknown category "${p.category}"`);
  } else if (!cat.subcategories.some((s) => s.id === p.subcategory)) {
    errors.push(
      `${where}: subcategory "${p.subcategory}" not declared under "${p.category}"`,
    );
  }

  if (typeof p.old_price !== "number" || typeof p.promo_price !== "number") {
    errors.push(`${where}: prices must be numbers`);
  } else if (p.promo_price > p.old_price) {
    errors.push(
      `${where}: promo_price (${p.promo_price}) is above old_price (${p.old_price})`,
    );
  }

  if (typeof p.stock !== "boolean") errors.push(`${where}: stock must be boolean`);

  if (p.specs && typeof p.specs === "object") {
    const filterable = filterableKeysFor(p);
    for (const [k, v] of Object.entries(p.specs)) {
      if (typeof v !== "string")
        errors.push(`${where}: spec "${k}" must be a string`);
      if (typeof v === "string" && v.includes(",") && filterable.has(k))
        errors.push(
          `${where}: filterable spec "${k}" value contains a comma, which breaks URL filter encoding`,
        );
    }
  }

  if (typeof p.image !== "string" || !p.image) {
    errors.push(`${where}: missing image`);
  } else if (p.image.startsWith("/")) {
    if (!existsSync(resolve(root, "public", p.image.slice(1))))
      errors.push(`${where}: local image not found at public${p.image}`);
  } else if (!/^https?:\/\//.test(p.image)) {
    errors.push(`${where}: image must be an absolute URL or a /public path`);
  }

  if (p.url != null && !/^https?:\/\//i.test(p.url))
    errors.push(`${where}: url must be an absolute http(s) URL`);

  if (p.gallery !== undefined) {
    if (!Array.isArray(p.gallery))
      errors.push(`${where}: gallery must be an array`);
    else
      for (const g of p.gallery)
        if (typeof g !== "string" || !/^https?:\/\//i.test(g))
          errors.push(`${where}: gallery entries must be absolute http(s) URLs`);
  }
}

// Every filterable spec dimension should have at least two distinct values,
// otherwise the filter renders a single useless option. Scopes are keyed either
// "category" or "category/subcategory".
for (const [scope, keys] of Object.entries(filterableSpecs)) {
  const [catId, subId] = scope.split("/");
  const cat = catById.get(catId);
  if (!cat) {
    errors.push(`filterable-specs.json: unknown category "${catId}"`);
    continue;
  }
  if (subId && !cat.subcategories.some((s) => s.id === subId)) {
    errors.push(`filterable-specs.json: unknown subcategory "${scope}"`);
    continue;
  }

  const scoped = products.filter(
    (p) => p.category === catId && (!subId || p.subcategory === subId),
  );
  for (const key of keys) {
    const values = new Set(scoped.map((p) => p.specs?.[key]).filter(Boolean));
    if (values.size === 0)
      errors.push(`FILTERABLE_SPECS[${scope}]: no product carries spec "${key}"`);
    else if (values.size === 1)
      warnings.push(
        `FILTERABLE_SPECS[${scope}]: spec "${key}" has only one value ("${[...values][0]}") — filter will be trivial`,
      );
    const missing = scoped.filter((p) => !p.specs?.[key]).map((p) => p.id);
    if (missing.length)
      warnings.push(
        `FILTERABLE_SPECS[${scope}]: spec "${key}" missing on ${missing.join(", ")}`,
      );
  }
}

/*
 * Banners. The images are hand-dropped into public/banners/ and the entries
 * hand-written, so check the two things that silently break: a missing file
 * (Next throws at build time, but only for the slide it happens to render),
 * and an href pointing at a filter combination that matches nothing — a
 * shopper clicking a "60% off coffee machines" banner and landing on
 * "შედეგი ვერ მოიძებნა" is worse than a banner that doesn't link at all.
 */
const banners = read("data/banners.json");
for (const [i, b] of banners.entries()) {
  const where = `banners[${i}] (${b.id ?? "no id"})`;
  if (!b.id) errors.push(`${where}: missing "id"`);
  if (!b.alt) errors.push(`${where}: missing "alt" — banners carry the offer`);

  for (const crop of ["desktop", "mobile"]) {
    const image = b[crop];
    if (!image?.src) {
      errors.push(`${where}: missing "${crop}.src"`);
      continue;
    }
    const file = resolve(root, "public", image.src.replace(/^\//, ""));
    if (!existsSync(file)) {
      errors.push(`${where}: ${crop} image not found at public${image.src}`);
      continue;
    }
    if (!image.width || !image.height)
      errors.push(`${where}: ${crop} needs width and height to reserve its slot`);
  }

  if (!b.href) continue;
  const query = new URLSearchParams(b.href.split("?")[1]?.split("#")[0] ?? "");
  const cat = query.get("cat");
  const subs = (query.get("sub") ?? "").split(",").filter(Boolean);
  if (cat && !catById.has(cat)) {
    errors.push(`${where}: href points at unknown category "${cat}"`);
    continue;
  }
  for (const sub of subs) {
    if (!catById.get(cat)?.subcategories.some((s) => s.id === sub))
      errors.push(`${where}: href points at unknown subcategory "${sub}"`);
  }
  const matches = products.filter(
    (p) =>
      (!cat || p.category === cat) &&
      (!subs.length || subs.includes(p.subcategory)),
  );
  if (matches.length === 0)
    errors.push(`${where}: href "${b.href}" matches no products`);
  else if (matches.length < 3)
    warnings.push(
      `${where}: href "${b.href}" matches only ${matches.length} product(s)`,
    );
}

/*
 * The search index is derived from products.json, so it goes stale silently:
 * search keeps working, it just stops knowing about the products that changed.
 * Nothing in the app can notice that at runtime, which is why it is checked
 * here — the fix is always `npm run search-index`.
 */
if (existsSync(resolve(root, "data/search-index.json"))) {
  const index = read("data/search-index.json");
  const indexed = new Map(index.entries.map((e) => [e.id, e]));
  const missing = products.filter((p) => !indexed.has(p.id));
  const orphaned = index.entries.filter(
    (e) => !products.some((p) => p.id === e.id),
  );
  const renamed = products.filter((p) => indexed.get(p.id)?.title !== p.title);

  if (missing.length || orphaned.length || renamed.length)
    errors.push(
      `data/search-index.json is stale (${missing.length} missing, ` +
        `${orphaned.length} removed, ${renamed.length} retitled) — ` +
        `run: npm run search-index`,
    );
} else {
  errors.push("data/search-index.json is missing — run: npm run search-index");
}

for (const w of warnings) console.warn(`warn  ${w}`);
for (const e of errors) console.error(`error ${e}`);

if (errors.length) {
  console.error(`\n${errors.length} error(s) in product data.`);
  process.exit(1);
}
console.log(
  `OK — ${products.length} products across ${categories.length} categories, ${warnings.length} warning(s).`,
);
