# ალტას რეგიონული კამპანიის ლენდინგი — გლდანის cashback

Campaign landing site for ALTA branch promotions. Currently the Gldani
cashback campaign (12–13 September); it ran the Telavi sale before that, and
the campaign's name, dates and branch live in `lib/campaign.ts`. Next.js
(App Router) +
Tailwind CSS v4. The catalog is a local JSON file imported from the shop's
product feed — no backend, no database at runtime.

## Running locally

```bash
npm install
npm run dev          # http://localhost:3000
```

Other scripts:

```bash
npm run build          # production build
npm start              # serve the production build
npm run lint           # eslint
npm run validate:data  # sanity-check data/products.json
npm run import:feed    # rebuild the catalog from the live product feed
```

## Project layout

```
app/
  page.tsx              landing (hero + catalog)
  product/[id]/page.tsx product detail
components/
  Catalog.tsx           filter state, URL sync, grid, mobile drawer
  FilterPanel.tsx       sidebar/drawer filter UI (shared)
  PriceRange.tsx        dual-thumb promo_price slider
  ActiveChips.tsx       active filter chips + clear all
  BrandPattern.tsx      the two ALTA pattern systems
  AltaIcon.tsx          rounded-tile brand icon set
  ProductCard.tsx  Hero.tsx  SiteHeader.tsx  SiteFooter.tsx
lib/
  filters.ts            URL <-> state, matching, faceting, sorting
  catalog.ts            data access + which specs are filterable per category
  format.ts             GEL formatting, discount %
data/
  products.json         the catalog
  categories.json       categories and subcategories
  filterable-specs.json which spec keys become filters, per category
  ProductImage.tsx      remote photo with a placeholder fallback
  ProductGallery.tsx    main photo + feed thumbnails
data/
  wanted-skus.txt       the SKUs to publish, one per line
  category-map.json     shop URL slug -> category tree
  feed-sample.xml       trimmed feed for offline runs and tests
public/brand/           ALTA logo + mark (vector, from the brand book)
public/img/             placeholder shown when a photo URL is dead
scripts/                feed importer + data validator
```

## Deploying

The app is a normal Next.js server app — `/product/[id]` renders on demand, so a
static export won't work without changes. Vercel is the path of least
resistance (same team as Next.js, free tier, no configuration):

1. **Push to GitHub.** From the project folder:

   ```bash
   git add -A
   git commit -m "ALTA Gldani cashback landing"
   git branch -M main
   git remote add origin https://github.com/<user>/<repo>.git
   git push -u origin main
   ```

   A **private** repo is the sensible default — it holds real prices and SKUs.
   The deployed site can still be public.

2. **Import it on Vercel.** vercel.com → *Add New… → Project* → pick the repo →
   *Deploy*. Everything is auto-detected; there are no environment variables to
   set. You get `https://<project>.vercel.app`, and every later `git push`
   redeploys automatically.

Notes:

- Product photos are hot-linked from `imgstore.alta.ge`. They load fine in a
  browser, but if that host ever blocks third-party referrers the site falls
  back to `/img/placeholder.svg` rather than breaking.
- Refreshing the catalog is a local step: `npm run import:feed`, then commit the
  changed files in `data/` and push. Nothing reads the feed at runtime, so the
  published prices are whatever was last imported.
- The site carries full ALTA branding and links out to alta.ge, so a public URL
  can read as an official ALTA page. Worth keeping that in mind before sharing
  it widely.


## Brand

The site follows the ALTA brand refresh (Leavingstone). The logo files in
`public/brand/` are the real vectors lifted out of the brand-book PDF, not
redraws:

```
alta-logo.svg         wordmark in purple + colour mark  (light backgrounds)
alta-logo-white.svg   white wordmark + colour mark      (purple backgrounds)
alta-mark.svg         mark only, full colour            (also app/icon.svg)
alta-mark-white.svg   mark only, all white
```

### Colours

Sampled straight from the brand-book vectors and exposed as Tailwind tokens
(`bg-alta-purple`, `text-alta-teal`, …) in `app/globals.css`:

| token               | hex       | used for                        |
| ------------------- | --------- | ------------------------------- |
| `alta-purple`       | `#652D8F` | primary — buttons, prices, links |
| `alta-purple-deep`  | `#3D2956` | body text, hero and footer base  |
| `alta-magenta`      | `#8F278D` | gradients, gift icon             |
| `alta-pink`         | `#AE236B` | gradients, delivery icon         |
| `alta-crimson`      | `#CC2047` | savings, discount icon           |
| `alta-red`          | `#EB1C24` | gradients, pattern accents       |
| `alta-flame`        | `#EF5A28` | gradients, promo icon            |
| `alta-orange`       | `#F5911E` | gradients, category icon         |
| `alta-teal`         | `#29E1CF` | discount %, in-stock, highlights |

Plus `alta-50 … alta-900`, a purple tint ramp for surfaces, borders and muted
text. The 60° gradient from the brand book is the `alta-gradient` /
`alta-gradient-deep` utilities; `alta-rule` is the thin gradient divider.

### Shape language

`alta-corners` and `alta-corners-xl` reproduce the signature silhouette — a
large radius on the top-left and bottom-right, near-square on the other two.
Applied to cards, buttons, inputs, badges and icon tiles so the whole UI shares
one outline.

### Patterns and icons

`components/BrandPattern.tsx` implements both pattern systems — `dashes` (the
scattered confetti bars) and `pipes` (stepped connected lines) — in light,
medium and heavy densities, for dark or light backgrounds. Each instance needs
a unique `patternId`.

`components/AltaIcon.tsx` is the rounded-tile icon set: `discount`, `home`,
`star`, `gift`, `cart`, `warranty`, `delivery`, each on its brand-coloured tile.

### Typography

The brand pairs **FiraGO** (Georgian) with **Ubuntu** (Latin and numerals). Both
are self-hosted via `@fontsource`, so nothing is fetched at runtime.

One caveat: `@fontsource/firago` ships **only the Latin subset** — there is no
packaged FiraGO Georgian. Out of the box Georgian therefore renders in Noto Sans
Georgian, which is also self-hosted. To use the real thing, drop the official
FiraGO Georgian webfonts into `public/fonts/`:

```
public/fonts/firago-georgian-400.woff2   (and .woff)
public/fonts/firago-georgian-500.woff2
public/fonts/firago-georgian-700.woff2
```

The `@font-face` rules in `app/globals.css` already point at those paths and sit
ahead of the fallback in the stack, so the site picks them up with no code
change. Nothing breaks if the files are absent.

## Product data

The catalog is generated from the shop's Google/Meta product feed (RSS 2.0 with
the `g:` namespace):

```bash
npm run import:feed                              # live feed + data/wanted-skus.txt
node scripts/import-xml-feed.mjs data/feed-sample.xml   # offline, from the bundled sample
node scripts/import-xml-feed.mjs <url-or-path> --all    # ignore the SKU list
node scripts/import-xml-feed.mjs <url-or-path> --only other-skus.txt
```

The default feed URL and SKU-list path are the two constants at the top of
`scripts/import-xml-feed.mjs`. Each run rewrites `products.json`,
`categories.json` and `filterable-specs.json` together, so the category tree can
never drift from the data. Re-run it whenever prices or stock change.

**Choosing which products appear.** `data/wanted-skus.txt` holds one SKU
(`g:id`) per line; only those are imported. Any SKU missing from the feed is
listed at the end of the run — usually because it has been delisted. Pass
`--all` to publish the whole feed instead.

**Categories** come from the slug in each product's shop URL
(`alta.ge/mtversasruti/…` → `mtversasruti`), grouped via
`data/category-map.json`. A slug that isn't in that file still imports — it
becomes its own top-level category with a prettified label — so a feed update
never breaks the build. Add an entry to group it properly.

**Brands.** Roughly a third of the feed omits `g:brand`, so the importer builds
a vocabulary from the brands the feed *does* declare and matches product titles
against it longest-first. That keeps two-word brands intact ("Russell Hobbs
24080-56" stays Russell Hobbs, not Russell) and normalises casing (`BRAUN` →
`Braun`, while `LG` is left alone).

**Prices.** `old_price` is `g:price` and `promo_price` is `g:sale_price` when
present, otherwise the list price. Products without a sale price are kept: they
show the list price with no badge and no fabricated "0 ₾ saved". Values outside
5–50 000 ₾ are treated as feed mistakes, skipped, and reported.

**Specs** are whatever structured attributes the feed carries — `g:color`,
`g:size`, `g:material`, `g:pattern`, `g:capacity` and friends — plus brand,
condition and warranty. The current feed declares none of the first group, so
the per-category spec filters are empty and the UI hides the section rather than
promising a filter that never appears. Add those fields to the feed and they
become filters automatically, no code change.

Run `npm run validate:data` after any manual edit: it checks referential
integrity, price sanity, image and gallery URLs, and flags spec values
containing a comma (the list separator used in query params).

### Product photos

Photos are the shop's own CDN URLs from the feed, including
`g:additional_image_link` extras, which become a thumbnail gallery on the detail
page. `components/ProductImage.tsx` renders them with `unoptimized` — loading
them directly in the browser, the way alta.ge does, rather than routing every
remote image through the Next optimizer — and swaps in `/img/placeholder.svg`
if a URL is dead. `next.config.ts` lists `imgstore.alta.ge` under
`remotePatterns` for the case where you turn optimization back on.

## Filtering

All filter state lives in the URL, so any view is shareable:

| param      | example                    | meaning                          |
| ---------- | -------------------------- | -------------------------------- |
| `q`        | `q=Sencor`                 | search on title + brand          |
| `cat`      | `cat=kitchen`              | category                         |
| `sub`      | `sub=yavis-aparati,aerogrili` | subcategories (multi)         |
| `brand`    | `brand=Sencor,Braun`       | brands (multi; the facet hides itself when the catalog has one brand) |
| `min`/`max`| `min=100&max=200`          | range over **`promo_price`**     |
| `s.<spec>` | `s.ფერი=Black`             | dynamic spec filter (multi), when the feed carries attributes |
| `stock`    | `stock=1`                  | in-stock only                    |
| `sort`     | `sort=price-asc`           | `discount-desc` (default), `price-asc`, `price-desc` |

Notes on the implementation:

- Filters are held in React state and *mirrored* to the URL with
  `router.replace`. That keeps rapid interactions coherent (two checkboxes
  ticked in the same tick never drop one) and repaints without waiting on the
  router, while the URL still fully describes the view.
- Only non-default values are serialized, so an unfiltered view has a clean
  URL and "clear all" empties the query string entirely.
- Facet counts exclude their own dimension — ticking a second brand doesn't
  make every other brand read "0".
- Spec filters are scoped to the selected category; clearing the category
  clears them.
- Search is debounced 250 ms.

## Notes

- Fonts are self-hosted, so the site works fully offline (see Brand →
  Typography for the FiraGO caveat).
- Prices are grouped by hand rather than through `Intl.NumberFormat`: Node and
  browsers ship different `ka-GE` grouping data, which made the same price
  render differently on the server-rendered detail page and in the
  client-rendered grid.
- The site is a front-end demo: "შეძენა" is not wired to a cart or checkout.
