#!/usr/bin/env node
/**
 * build-search-index.mjs — precompute the search corpus.
 *
 * Writes data/search-index.json. Every product gets its searchable fields three
 * ways:
 *
 *   original — exactly as it will be painted on screen. Highlighting needs it,
 *              and nothing else does.
 *   latin    — normalized and folded to Latin.
 *   ka       — normalized and folded to the reduced Georgian alphabet.
 *
 * Both folded forms are produced by `lib/translit.js`, the same module the
 * browser runs against the query. That shared module is the whole point of
 * doing this at build time: the runtime never transliterates the corpus, only
 * the handful of characters somebody typed.
 *
 * Also writes reports/search-index.md, which is where to look when an alias
 * does not fire — it lists every alias that resolves to nothing in the current
 * catalog.
 *
 * Usage
 * -----
 *   npm run search-index
 *   npm run search-index -- --check   exit non-zero if the file is stale
 */

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { toGeorgian, toLatin } from "../lib/translit.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PRODUCTS_FILE = path.join(ROOT, "data", "products.json");
const CATEGORIES_FILE = path.join(ROOT, "data", "categories.json");
const ALIASES_FILE = path.join(ROOT, "data", "search-aliases.json");
const OUT_FILE = path.join(ROOT, "data", "search-index.json");
const REPORT_FILE = path.join(ROOT, "reports", "search-index.md");

const readJson = async (file) => JSON.parse(await fs.readFile(file, "utf8"));

/**
 * Product codes are the barCode from the CSV. Branch staff read them off shelf
 * labels, so an exact hit on one has to short-circuit the fuzzy machinery
 * entirely — `162646` must never be "did you mean".
 */
const CODE_PATTERN = /^\d{5,7}$/;

async function main() {
  const products = await readJson(PRODUCTS_FILE);
  const categories = await readJson(CATEGORIES_FILE);
  const aliases = await readJson(ALIASES_FILE);

  /** category id -> label, and `category/subcategory` -> label */
  const labels = new Map();
  for (const category of categories) {
    labels.set(category.id, category.label);
    for (const sub of category.subcategories)
      labels.set(`${category.id}/${sub.id}`, sub.label);
  }

  const entries = products.map((product) => {
    /*
     * The subcategory label only — deliberately not the parent group.
     *
     * Parent labels are navigation, not vocabulary: nobody searches "თეთრი
     * ტექნიკა", and including them is actively harmful. Every gaming
     * accessory sits under "ტელევიზორები და გეიმინგი", so with the parent in
     * the field a search for ტელევიზორი returned eighteen PlayStation
     * controllers ahead of the televisions. Subcategory labels are the words
     * people actually type — მაუსი, ნოუთბუქი, ყურსასმენები.
     *
     * Anything the parent would have covered belongs in
     * `data/search-aliases.json`, pointed at the subcategory it means.
     */
    const category =
      labels.get(`${product.category}/${product.subcategory}`) ??
      product.subcategory;

    return {
      id: product.id,
      title: product.title,
      brand: product.brand,
      category,
      latin: {
        title: toLatin(product.title),
        brand: toLatin(product.brand),
        category: toLatin(category),
      },
      ka: {
        title: toGeorgian(product.title),
        brand: toGeorgian(product.brand),
        category: toGeorgian(category),
      },
    };
  });

  /*
   * Aliases are folded here too, so the runtime compares one normalized string
   * against another instead of re-deriving both on every keystroke. Each
   * spelling is stored in both lanes, because the file is written by hand and
   * nobody should have to remember which script a given entry needs.
   */
  const aliasTerms = aliases.terms ?? {};
  const foldedAliases = Object.entries(aliasTerms).map(([term, spellings]) => ({
    term,
    spellings: [
      ...new Set(
        [term, ...spellings].flatMap((s) => [toLatin(s), toGeorgian(s)]),
      ),
    ].filter(Boolean),
  }));

  const index = {
    generated_at: new Date().toISOString(),
    products: entries.length,
    code_pattern: CODE_PATTERN.source,
    aliases: foldedAliases,
    entries,
  };

  await fs.writeFile(OUT_FILE, `${JSON.stringify(index, null, 1)}\n`, "utf8");

  /* --- report ------------------------------------------------------ */

  const haystack = entries
    .map((e) => `${e.latin.title} ${e.latin.brand} ${e.latin.category}`)
    .join("\n");
  const dead = foldedAliases.filter(({ term }) => {
    const needle = toLatin(term);
    return needle.length > 1 && !haystack.includes(needle);
  });

  const duplicates = new Map();
  for (const { term, spellings } of foldedAliases)
    for (const spelling of spellings) {
      if (!duplicates.has(spelling)) duplicates.set(spelling, []);
      duplicates.get(spelling).push(term);
    }
  const clashes = [...duplicates.entries()].filter(([, terms]) => terms.length > 1);

  const lines = [
    "# საძიებო ინდექსი",
    "",
    `გენერირებულია: ${index.generated_at}`,
    "",
    `- პროდუქტი: **${entries.length}**`,
    `- ალიასი: **${foldedAliases.length}** (${foldedAliases.reduce((n, a) => n + a.spellings.length, 0)} დაკეცილი დაწერილობა)`,
    `- პროდუქტის კოდი: ${CODE_PATTERN.source} — ზუსტი დამთხვევა გვერდს ავლის fuzzy ძებნას`,
    "",
    "## ალიასები, რომლებსაც ამ კატალოგში შესატყვისი არ აქვს",
    "",
  ];

  if (dead.length) {
    lines.push(
      "ეს ჩანაწერები არ არის შეცდომა — ისინი მაშინვე ამუშავდება, როცა",
      "კატალოგში შესაბამისი პროდუქტი გაჩნდება. სანამ არ გაჩნდება, ამ სიტყვებზე",
      "ძებნა შედეგს ვერ იპოვის.",
      "",
      ...dead.map(({ term }) => `- \`${term}\``),
      "",
    );
  } else {
    lines.push("ყველა ალიასს ჰყავს შესატყვისი პროდუქტი.", "");
  }

  if (clashes.length) {
    lines.push(
      "## ერთი დაწერილობა, რამდენიმე ალიასი",
      "",
      "დაკეცვის შემდეგ ეს დაწერილობები ერთმანეთს ემთხვევა, ამიტომ ორივე",
      "ტერმინი მოიძებნება — ჩვეულებრივ ეს სასურველია, მაგრამ თუ არა, შეცვალეთ",
      "`data/search-aliases.json`.",
      "",
      ...clashes.map(([spelling, terms]) => `- \`${spelling}\` → ${terms.join(", ")}`),
      "",
    );
  }

  await fs.mkdir(path.dirname(REPORT_FILE), { recursive: true });
  await fs.writeFile(REPORT_FILE, `${lines.join("\n")}\n`, "utf8");

  console.log(
    `data/search-index.json — ${entries.length} პროდუქტი, ` +
      `${foldedAliases.length} ალიასი${dead.length ? `, ${dead.length} უშედეგო ალიასი` : ""}`,
  );

  if (process.argv.includes("--check")) {
    // Only meaningful in CI: the index is a pure function of products.json,
    // categories.json and search-aliases.json, so a dirty tree after a rebuild
    // means somebody edited one of them without re-running this.
    const { execSync } = await import("node:child_process");
    const dirty = execSync("git status --porcelain data/search-index.json", {
      cwd: ROOT,
      encoding: "utf8",
    }).trim();
    if (dirty) {
      console.error("data/search-index.json is stale — commit the rebuild.");
      process.exit(1);
    }
  }
}

main().catch((error) => {
  console.error(String(error.message ?? error));
  process.exit(1);
});
