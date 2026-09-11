import Link from "next/link";
import ProductGallery from "@/components/ProductGallery";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import {
  categoryLabel,
  getProduct,
  products,
  relatedProducts,
  subcategoryLabel,
} from "@/lib/catalog";
import { discountPercent, formatPrice, savings } from "@/lib/format";
import ProductCard from "@/components/ProductCard";
import AltaIcon from "@/components/AltaIcon";
import SpecTable from "@/components/SpecTable";
import BundleBox from "@/components/BundleBox";
import { bundleFor } from "@/lib/bundles";
import CompareToggle from "@/components/CompareToggle";

/**
 * The Gldani branch on Google Maps. Built with the documented Maps URLs API
 * (`/maps/search/?api=1`) rather than the share.google short link the branch
 * page hands out: the short form redirects through Google Search and can be
 * retired, while this one is a stable contract and opens the Maps app directly
 * on phones.
 *
 * Searched by name and mall rather than by street address — "ხიზაბავრის ქ. 1"
 * on its own lands on the road, while the shop inside City Mall Gldani is a
 * place Maps knows.
 */
const BRANCH_MAP =
  "https://www.google.com/maps/search/?api=1&query=Alta+City+Mall+Gldani";

type PageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export function generateStaticParams() {
  return products.map((p) => ({ id: p.id }));
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { id } = await params;
  const product = getProduct(id);
  if (!product) return { title: "პროდუქტი ვერ მოიძებნა" };
  return {
    title: product.title,
    description: `${product.title} — ${formatPrice(product.promo_price)}. cashback აქცია ალტას გლდანის ფილიალში, 12–13 სექტემბერს.`,
  };
}

/** Rebuilds the catalog query string so "back" lands on the same filtered view. */
function backHref(raw: Record<string, string | string[] | undefined>): string {
  const sp = new URLSearchParams();
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value === "string") sp.set(key, value);
    else if (Array.isArray(value)) for (const v of value) sp.append(key, v);
  }
  const qs = sp.toString();
  return `/${qs ? `?${qs}` : ""}#catalog`;
}

export default async function ProductPage({ params, searchParams }: PageProps) {
  const { id } = await params;
  const product = getProduct(id);
  if (!product) notFound();

  const raw = await searchParams;
  const back = backHref(raw);
  const query = back.slice(1).replace("#catalog", "");

  const discount = discountPercent(product.old_price, product.promo_price);
  const saved = savings(product.old_price, product.promo_price);
  const related = relatedProducts(product);
  const photos = [product.image, ...(product.gallery ?? [])].filter(
    (src, i, all) => src && all.indexOf(src) === i,
  );
  const bundle = bundleFor(product.id);
  const hasSpecs =
    Object.keys(product.specs).length > 0 ||
    Object.keys(product.specs_other ?? {}).length > 0;

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <nav aria-label="ნავიგაცია" className="text-xs text-alta-400">
        <ol className="flex flex-wrap items-center gap-1.5">
          <li>
            <Link href="/" className="hover:text-alta-purple">
              მთავარი
            </Link>
          </li>
          <li aria-hidden>/</li>
          <li>
            <Link
              href={`/?cat=${product.category}#catalog`}
              className="hover:text-alta-purple"
            >
              {categoryLabel(product.category)}
            </Link>
          </li>
          <li aria-hidden>/</li>
          <li className="truncate font-medium text-alta-700">
            {product.title}
          </li>
        </ol>
      </nav>

      <Link
        href={back}
        className="mt-4 inline-flex items-center gap-1.5 text-sm font-bold text-alta-purple hover:underline"
      >
        <span aria-hidden>←</span> უკან შედეგებში
      </Link>

      <div className="mt-6 grid gap-8 lg:grid-cols-2">
        {/* Photos */}
        <div className="relative self-start">
          <ProductGallery images={photos} alt={product.title} />
          {discount > 0 && (
            <span className="alta-corners absolute left-5 top-5 z-10 bg-alta-teal px-3.5 py-1.5 text-base font-bold text-alta-purple-deep">
              −{discount}%
            </span>
          )}

          {/* Sits directly under the gallery. Renders nothing when this
              product has no qualifying accessories. */}
          <BundleBox
            main={{
              id: product.id,
              title: product.title,
              image: product.image,
              price: product.promo_price,
              old_price: discount > 0 ? product.old_price : null,
              brand: product.brand,
            }}
            items={bundle}
          />
        </div>

        {/* Summary */}
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-alta-400">
            {categoryLabel(product.category)} ·{" "}
            {subcategoryLabel(product.category, product.subcategory)}
          </p>

          <h1 className="mt-2 text-2xl font-bold leading-snug text-alta-purple-deep sm:text-3xl">
            {product.title}
          </h1>

          <p className="mt-2 text-sm text-alta-400">
            ბრენდი:{" "}
            <Link
              href={`/?brand=${encodeURIComponent(product.brand)}#catalog`}
              className="font-semibold text-alta-700 hover:text-alta-purple"
            >
              {product.brand}
            </Link>
            <span className="mx-2 text-alta-200">|</span>
            კოდი: <span className="tabular-nums">{product.id}</span>
          </p>

          <div className="alta-corners-xl mt-6 border border-alta-100 bg-alta-50 p-6">
            <div className="flex flex-wrap items-end gap-x-3 gap-y-2">
              <span className="text-4xl font-bold text-alta-purple">
                {formatPrice(product.promo_price)}
              </span>
              {discount > 0 && (
                <span className="text-lg font-medium text-alta-300 line-through">
                  {formatPrice(product.old_price)}
                </span>
              )}
              {discount > 0 && (
                <span className="alta-corners bg-alta-teal px-2.5 py-1 text-sm font-bold text-alta-purple-deep">
                  −{discount}%
                </span>
              )}
            </div>
            {saved > 0 && (
              <p className="mt-3 flex items-center gap-2 text-sm font-bold text-alta-crimson">
                <AltaIcon name="discount" size="sm" />
                თქვენ დაზოგავთ {formatPrice(saved)}
              </p>
            )}
          </div>

          <div className="mt-7 flex flex-wrap gap-3">
            <a
              href={BRANCH_MAP}
              target="_blank"
              rel="noopener noreferrer"
              className="alta-corners inline-flex items-center gap-2.5 bg-alta-purple px-7 py-3.5 text-sm font-bold text-white transition hover:bg-alta-700"
            >
              <svg viewBox="0 0 24 24" aria-hidden className="size-5">
                <path
                  d="M12 21s7-5.4 7-11a7 7 0 1 0-14 0c0 5.6 7 11 7 11Z"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.9"
                  strokeLinejoin="round"
                />
                <circle
                  cx="12"
                  cy="10"
                  r="2.5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.9"
                />
              </svg>
              გლდანის ფილიალი
            </a>
            <CompareToggle id={product.id} variant="detail" />
          </div>
        </div>
      </div>

      {/* Specs. Omitted entirely for a product whose attributes have not been
          scraped yet — a heading over an empty box is worse than no heading. */}
      {hasSpecs && (
        <section className="mt-14">
          <h2 className="text-lg font-bold text-alta-purple-deep">
            მახასიათებლები
          </h2>
          <SpecTable specs={product.specs} other={product.specs_other} />
        </section>
      )}

      {/* Related */}
      {related.length > 0 && (
        <section className="mt-14">
          <h2 className="text-lg font-bold text-alta-purple-deep">
            მსგავსი შეთავაზებები
          </h2>
          <div className="mt-4 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {related.map((p) => (
              <ProductCard key={p.id} product={p} query={query} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
