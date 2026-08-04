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
    for (const [k, v] of Object.entries(p.specs)) {
      if (typeof v !== "string")
        errors.push(`${where}: spec "${k}" must be a string`);
      if (typeof v === "string" && v.includes(","))
        errors.push(
          `${where}: spec "${k}" value contains a comma, which breaks URL filter encoding`,
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
// otherwise the filter renders a single useless option.
const filterableSpecs = read("data/filterable-specs.json");
for (const [catId, keys] of Object.entries(filterableSpecs)) {
  if (!catById.has(catId))
    errors.push(`filterable-specs.json: unknown category "${catId}"`);
  const scoped = products.filter((p) => p.category === catId);
  for (const key of keys) {
    const values = new Set(scoped.map((p) => p.specs?.[key]).filter(Boolean));
    if (values.size === 0)
      errors.push(`FILTERABLE_SPECS.${catId}: no product carries spec "${key}"`);
    else if (values.size === 1)
      warnings.push(
        `FILTERABLE_SPECS.${catId}: spec "${key}" has only one value ("${[...values][0]}") — filter will be trivial`,
      );
    const missing = scoped.filter((p) => !p.specs?.[key]).map((p) => p.id);
    if (missing.length)
      warnings.push(
        `FILTERABLE_SPECS.${catId}: spec "${key}" missing on ${missing.join(", ")}`,
      );
  }
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
