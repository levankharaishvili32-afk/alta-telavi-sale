#!/usr/bin/env node
/**
 * normalize-specs.mjs — give the scraped specs a stable, ordered vocabulary.
 *
 * alta.ge keeps a fairly tight attribute vocabulary *within* a category, but
 * across the whole catalog the same idea shows up under different names
 * ("შესრუტვის სიმძლავრე" and "შეწოვის სიმძლავრე" are one thing), and every
 * category carries a long tail of attributes nobody compares on. Comparison
 * needs the opposite: a short, ordered, predictable set of rows.
 *
 * What it writes
 * --------------
 *   data/spec-schema.json      per-scope canonical key order + a global alias map
 *   data/products.json         rewritten: canonical keys in `specs`,
 *                              everything else moved to `specs_other`
 *   reports/spec-coverage.md   per scope, how full each canonical key is
 *
 * A "scope" is `category/subcategory` — the same key used by
 * `data/filterable-specs.json`. Category alone is too coarse to be useful: a
 * mouse and a printer are both `it` and share almost no attribute.
 *
 * Idempotence
 * -----------
 * The script always re-merges `specs` and `specs_other` before splitting them
 * again, so running it twice changes nothing. Run it after `npm run scrape`,
 * which rewrites products.json from the scrape and knows nothing about this.
 *
 * Hand-tuning
 * -----------
 * `data/spec-schema.json` is meant to be edited. Reorder a `keys` array and
 * the comparison table reorders with it; add an entry to `aliases` and the
 * next run folds that raw key into the canonical one. Anything you add by hand
 * is preserved: generated keys are appended after yours, never in front, and
 * your aliases always win. `--reset` throws that away and regenerates clean.
 *
 * Usage
 * -----
 *   npm run specs
 *   npm run specs -- --dry      report only, write nothing
 *   npm run specs -- --reset    ignore the existing schema and regenerate
 */

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PRODUCTS_FILE = path.join(ROOT, "data", "products.json");
const CATEGORIES_FILE = path.join(ROOT, "data", "categories.json");
const SCHEMA_FILE = path.join(ROOT, "data", "spec-schema.json");
const FILTERABLE_FILE = path.join(ROOT, "data", "filterable-specs.json");
const REPORT_FILE = path.join(ROOT, "reports", "spec-coverage.md");

/** A key has to appear on this share of a scope's products to be canonical. */
const MIN_COVERAGE = 0.25;
/** …unless it is a recognised decision driver, which only needs this much. */
const MIN_COVERAGE_PRIORITISED = 0.15;
/** Rows beyond this are tail; they stay in `specs_other`. */
const MAX_KEYS_PER_SCOPE = 22;

/** Spec keys that repeat a field the catalog already filters on directly. */
const DUPLICATE_OF_FIELD = new Set(["ბრენდი"]);

/**
 * How decision-relevant a key is, most-relevant first. The comparison table
 * reads top to bottom, so this is the order a shopper sees.
 *
 * Ordering here is by *concept*, not by category: whatever a TV, a monitor and
 * a phone call their screen, it lands at the top of all three. Identity fields
 * (brand, part number) sit at the bottom on purpose — they already appear in
 * the comparison header, and repeating them as the first two rows pushes the
 * things people actually decide on below the fold.
 */
const PRIORITY = [
  [/^(დიაგონალი|ეკრანი|ეკრანის ზომა|screen size)$/i, 100],
  [/^(გარჩევადობა|resolution)$/i, 96],
  [/^(ეკრანის ტიპი|პანელის ტიპი|მატრიცის ტიპი)$/i, 92],
  [/განახლების სიხშირე/i, 90],
  [/^(ოპერაციული სისტემა|სმარტ პლატფორმა|smart)/i, 88],
  [/^(პროცესორის\/ჩიპსეტის ტიპი|პროცესორის ტიპი|პროცესორი)$/i, 86],
  [/ბირთვების რაოდენობა/i, 82],
  [/^(RAM მოცულობა|ოპერატიული მეხსიერება|RAM)$/i, 80],
  [/^(შიდა მეხსიერება|SSD მოცულობა|მეხსიერების ტევადობა|მეხსიერება)$/i, 78],
  [/^(ვიდეო ბარათი|გრაფიკული პროცესორი|ვიდეო ადაპტერის ტიპი)$/i, 74],
  [/^(ელემენტის მოცულობა|ბატარეა|აკუმულატორის ტევადობა)$/i, 72],
  [/ელემენტის მუშაობის/i, 70],
  [/^(მთავარი კამერა MP|ძირითადი კამერა)/i, 68],
  [/^სელფის/i, 64],
  [/^(სიმძლავრე|შესრუტვის სიმძლავრე|შეწოვის სიმძლავრე|სპიკერის სიმძლავრე)$/i, 62],
  [/^(მოცულობა|ჯამური მოცულობა|შიდა მოცულობა|წყლის კონტეინერი|ჯამის მოცულობა)$/i, 60],
  [/^(ტიპი|კონსტრუქციის ტიპი|წმენდის ტიპი)$/i, 56],
  [/კავშირის ტექნოლოგია|დაკავშირების ტიპი|კავშირის ტიპი/i, 54],
  [/^(სენსორის ტიპი|მაქსიმალური სიჩქარე|გარჩევადობა \(dpi\))$/i, 52],
  [/^(სიჩქარეების რაოდენობა|ღილაკების რაოდენობა|მაუსის ღილაკების რაოდენობა)$/i, 50],
  [/^(Bluetooth|Wi-Fi|WI-FI სტანდარტები|WI-FI სიჩქარე|NFC|5G|4G \(LTE\))$/i, 46],
  [/^(HDMI|USB Type-C|USB პორტები|3\.5 mm Audio Jack|RJ-45 \(LAN\))$/i, 44],
  [/^(სიკაშკაშე|კონტრასტ|ფერების რაოდენობა|ეკრანის დაყოვნების დრო)/i, 42],
  [/^(ხმაურის დონე|მტვერსასრუტის ხმაურის დონე)/i, 40],
  [/ენერგოეფექტურობის კლასი|ენერგიის წყარო|ვოლტაჟი/i, 38],
  [/^(გარანტია|მდგომარეობა)$/i, 20],
  [/^(ზომები|წონა|ფერი|გამოყენებული მასალა|კორპუსის მასალა)/i, 16],
  [/^(სერია|მოდელი\/PN|მოდელი|ბრენდი)$/i, 4],
];

function priorityOf(key) {
  for (const [pattern, weight] of PRIORITY) if (pattern.test(key)) return weight;
  return 0;
}

/**
 * Raw key → canonical key, applied before anything else. Seeded here rather
 * than inferred: two keys that merely look alike often are not the same thing
 * ("წონა" vs "წონა სადგამით" differ by the stand), and silently merging them
 * would corrupt the comparison. Everything unmapped simply keeps its own name.
 */
const SEED_ALIASES = {
  "შესრუტვის სიმძლავრე": "შეწოვის სიმძლავრე",
  "ეკრანი": "დიაგონალი",
  "ეკრანის ზომა": "დიაგონალი",
  "Screen size": "დიაგონალი",
  "ოპერატიული მეხსიერება": "RAM მოცულობა",
  "RAM": "RAM მოცულობა",
  "მეხსიერება": "შიდა მეხსიერება",
  "პროცესორის ტიპი": "პროცესორის/ჩიპსეტის ტიპი",
  "პროცესორი": "პროცესორის/ჩიპსეტის ტიპი",
  "პანელის ტიპი": "ეკრანის ტიპი",
  "მატრიცის ტიპი": "ეკრანის ტიპი",
  "აკუმულატორის ტევადობა": "ელემენტის მოცულობა",
  "ბატარეა": "ელემენტის მოცულობა",
};

// ------------------------------------------------------------------ utils

const clean = (s) => String(s ?? "").replace(/[\s ]+/g, " ").trim();

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

const scopeOf = (p) => `${p.category}/${p.subcategory}`;

// ------------------------------------------------------------------- main

async function main() {
  const argv = process.argv.slice(2);
  const dry = argv.includes("--dry");
  const reset = argv.includes("--reset");

  const products = await readJson(PRODUCTS_FILE);
  if (!products?.length) throw new Error(`ვერ წავიკითხე ${PRODUCTS_FILE}`);
  const categories = (await readJson(CATEGORIES_FILE)) ?? [];
  const existing = reset ? null : await readJson(SCHEMA_FILE);

  const label = new Map();
  for (const c of categories)
    for (const s of c.subcategories) label.set(`${c.id}/${s.id}`, s.label);

  // Hand-written aliases outrank the seeds, so tuning survives a rerun.
  const aliases = { ...SEED_ALIASES, ...(existing?.aliases ?? {}) };
  const canonical = (key) => aliases[clean(key)] ?? clean(key);

  // ---- merge specs back together, then re-split ------------------------
  const merged = products.map((p) => {
    const all = {};
    for (const [k, v] of Object.entries({ ...p.specs, ...p.specs_other })) {
      const key = canonical(k);
      const value = clean(v);
      if (!key || !value) continue;
      // Two raw keys folding onto one canonical: first non-empty wins, and
      // `specs` is visited before `specs_other`, so the canonical side does.
      all[key] ??= value;
    }
    return { product: p, all };
  });

  // ---- decide the canonical key set per scope --------------------------
  const scopes = new Map();
  for (const { product, all } of merged) {
    const scope = scopeOf(product);
    if (!scopes.has(scope)) scopes.set(scope, { total: 0, counts: new Map() });
    const entry = scopes.get(scope);
    entry.total += 1;
    for (const key of Object.keys(all))
      entry.counts.set(key, (entry.counts.get(key) ?? 0) + 1);
  }

  const schemaCategories = {};
  for (const [scope, { total, counts }] of [...scopes.entries()].sort()) {
    const scored = [...counts.entries()].map(([key, n]) => ({
      key,
      coverage: n / total,
      priority: priorityOf(key),
    }));

    const kept = scored
      .filter(
        (s) =>
          s.coverage >=
          (s.priority > 0 ? MIN_COVERAGE_PRIORITISED : MIN_COVERAGE),
      )
      .sort(
        (a, b) =>
          b.priority - a.priority ||
          b.coverage - a.coverage ||
          a.key.localeCompare(b.key, "ka"),
      )
      .slice(0, MAX_KEYS_PER_SCOPE)
      .map((s) => s.key);

    // A hand-ordered list from the existing schema is authoritative: keep its
    // order, drop keys the data no longer has, and append anything new at the
    // end where it is easy to spot and move.
    const previous = existing?.categories?.[scope]?.keys ?? null;
    const keys = previous
      ? [
          ...previous.filter((k) => counts.has(canonical(k))).map(canonical),
          ...kept.filter((k) => !previous.map(canonical).includes(k)),
        ]
      : kept;

    schemaCategories[scope] = {
      label: label.get(scope) ?? scope,
      products: total,
      keys: [...new Set(keys)],
    };
  }

  const schema = {
    _comment: [
      "Generated by `npm run specs`, then meant to be edited by hand.",
      "",
      "`categories` is keyed by category/subcategory. `keys` is the ordered",
      "row list the comparison table renders, most decision-relevant first —",
      "reorder it and the table reorders. Keys you remove drop out of `specs`",
      "and into `specs_other` on the next run.",
      "",
      "`aliases` folds a raw scraped key into a canonical one. Add a pair and",
      "re-run; both spellings then land on the same comparison row. Careful",
      "with near-misses: \"წონა\" and \"წონა სადგამით\" are different numbers.",
      "",
      "Your edits survive a re-run — existing order is kept, newly-discovered",
      "keys are appended at the end. `--reset` regenerates from scratch.",
    ],
    generated_at: new Date().toISOString().slice(0, 10),
    aliases,
    categories: schemaCategories,
  };

  // ---- rewrite products -------------------------------------------------
  const rewritten = products.map((p, i) => {
    const { all } = merged[i];
    const keys = schemaCategories[scopeOf(p)]?.keys ?? [];
    const specs = {};
    for (const key of keys) if (all[key] !== undefined) specs[key] = all[key];
    const other = {};
    for (const [key, value] of Object.entries(all))
      if (!(key in specs)) other[key] = value;

    const next = { ...p, specs };
    if (Object.keys(other).length) next.specs_other = other;
    else delete next.specs_other;
    return next;
  });

  /*
   * Moving a key into `specs_other` silently kills any filter facet built on
   * it — `filterable-specs.json` is generated by the scraper, before this runs,
   * and the sidebar would render a facet with zero options forever. Prune it
   * here to whatever survived, and say what went.
   */
  const filterable = (await readJson(FILTERABLE_FILE)) ?? {};
  const dropped = [];
  const prunedFilterable = {};
  for (const [scope, keys] of Object.entries(filterable)) {
    const scoped = rewritten.filter((p) =>
      scope.includes("/") ? scopeOf(p) === scope : p.category === scope,
    );
    prunedFilterable[scope] = keys.filter((key) => {
      // Same rule as the scraper's: a spec that duplicates a first-class field
      // would render a second, identical facet panel.
      if (DUPLICATE_OF_FIELD.has(key)) {
        dropped.push(`${scope}: ${key} (დუბლირებს ბრენდის ფილტრს)`);
        return false;
      }
      const alive = scoped.some((p) => key in p.specs);
      if (!alive) dropped.push(`${scope}: ${key}`);
      return alive;
    });
  }

  if (!dry) {
    await writeJson(SCHEMA_FILE, schema);
    await writeJson(PRODUCTS_FILE, rewritten);
    if (dropped.length) await writeJson(FILTERABLE_FILE, prunedFilterable);
  }

  if (dropped.length) {
    console.log(
      `ფილტრებიდან მოიხსნა ${dropped.length} გასაღები (specs_other-ში გადავიდა):`,
    );
    for (const line of dropped) console.log(`   ${line}`);
  }

  await writeReport({ schemaCategories, merged, rewritten, aliases, dry });

  const canonicalCount = Object.values(schemaCategories).reduce(
    (n, c) => n + c.keys.length,
    0,
  );
  const otherCount = rewritten.reduce(
    (n, p) => n + Object.keys(p.specs_other ?? {}).length,
    0,
  );
  console.log(
    `${scopes.size} კატეგორია, ${canonicalCount} კანონიკური გასაღები; ` +
      `${otherCount} მნიშვნელობა გადავიდა specs_other-ში.${dry ? " (dry)" : ""}`,
  );
  console.log("ანგარიში: reports/spec-coverage.md");
}

// ----------------------------------------------------------------- report

async function writeReport({ schemaCategories, merged, rewritten, aliases, dry }) {
  const byScope = new Map();
  for (const { product, all } of merged) {
    const scope = scopeOf(product);
    if (!byScope.has(scope)) byScope.set(scope, []);
    byScope.get(scope).push(all);
  }

  const sections = [];
  const summary = [];

  for (const [scope, meta] of Object.entries(schemaCategories)) {
    const items = byScope.get(scope) ?? [];
    const rows = meta.keys.map((key) => {
      const filled = items.filter((all) => all[key] !== undefined).length;
      return { key, filled, pct: items.length ? filled / items.length : 0 };
    });
    const avg = rows.length
      ? rows.reduce((s, r) => s + r.pct, 0) / rows.length
      : 0;
    summary.push({ scope, label: meta.label, n: items.length, keys: rows.length, avg });

    sections.push(
      [
        `### ${meta.label} \`${scope}\``,
        "",
        `${items.length} პროდუქტი · ${rows.length} კანონიკური გასაღები · საშუალო შევსება ${(avg * 100).toFixed(0)}%`,
        "",
        "| # | გასაღები | შევსებული | % |",
        "| --- | --- | --- | --- |",
        ...rows.map(
          (r, i) =>
            `| ${i + 1} | ${r.key} | ${r.filled}/${items.length} | ${(r.pct * 100).toFixed(0)}% |`,
        ),
        "",
      ].join("\n"),
    );
  }

  summary.sort((a, b) => a.avg - b.avg);

  const otherKeys = new Map();
  for (const p of rewritten)
    for (const key of Object.keys(p.specs_other ?? {}))
      otherKeys.set(key, (otherKeys.get(key) ?? 0) + 1);
  const topOther = [...otherKeys.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 25);

  const md = `# სპეციფიკაციების დაფარვა

${dry ? "**dry-run** — ფაილები არ შეცვლილა.\n\n" : ""}კანონიკური გასაღები ირჩევა კატეგორიის შიგნით შევსების მიხედვით და ლაგდება
მნიშვნელობის მიხედვით (ჯერ ის, რითიც არჩევანს აკეთებენ). დანარჩენი გადადის
\`specs_other\`-ში — არსად არ იკარგება, უბრალოდ შედარების ცხრილში არ ჩანს.

## ყველაზე სუსტად შევსებული კატეგორიები

| კატეგორია | პროდუქტი | გასაღები | საშ. შევსება |
| --- | --- | --- | --- |
${summary
  .slice(0, 12)
  .map(
    (s) =>
      `| ${s.label} \`${s.scope}\` | ${s.n} | ${s.keys} | ${(s.avg * 100).toFixed(0)}% |`,
  )
  .join("\n")}

## ყველაზე ხშირი გასაღები \`specs_other\`-ში

თუ რომელიმე მათგანი შედარებაში გინდა — გადაიტანე შესაბამისი კატეგორიის
\`keys\` სიაში \`data/spec-schema.json\`-ში და გაუშვი \`npm run specs\`.

| გასაღები | პროდუქტი |
| --- | --- |
${topOther.map(([k, n]) => `| ${k} | ${n} |`).join("\n")}

## აქტიური ალიასები

${
  Object.keys(aliases).length
    ? ["| ნედლი გასაღები | კანონიკური |", "| --- | --- |", ...Object.entries(aliases).map(([a, b]) => `| ${a} | ${b} |`)].join("\n")
    : "_არცერთი._"
}

## კატეგორიები დეტალურად

${sections.join("\n")}
`;

  await fs.mkdir(path.dirname(REPORT_FILE), { recursive: true });
  await fs.writeFile(REPORT_FILE, md, "utf8");
}

main().catch((error) => {
  console.error(String(error.message ?? error));
  process.exit(1);
});
