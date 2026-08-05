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
import AltaIcon, { type IconName } from "@/components/AltaIcon";
import SpecTable from "@/components/SpecTable";

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
  const discount = discountPercent(product.old_price, product.promo_price);
  return {
    title: product.title,
    description: `${product.title} — ${formatPrice(product.promo_price)} (−${discount}%). თელავის დიდი ფასდაკლება.`,
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

  const benefits: { icon: IconName; text: string }[] = [
    { icon: "delivery", text: "უფასო მიწოდება თელავში შეკვეთიდან 24 საათში" },
    { icon: "cart", text: "განვადება 0%-იანი პირველადი შენატანით" },
    {
      icon: "warranty",
      text: `ოფიციალური გარანტია ${product.specs["გარანტია"] ?? "მწარმოებლის პირობებით"}`,
    },
  ];

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

          <div className="mt-5 flex items-center gap-2 text-sm">
            <span
              className={`size-2.5 rounded-full ${
                product.stock ? "bg-alta-teal" : "bg-alta-300"
              }`}
              aria-hidden
            />
            <span
              className={
                product.stock
                  ? "font-semibold text-alta-purple"
                  : "font-semibold text-alta-400"
              }
            >
              {product.stock ? "მარაგშია — თელავის ფილიალი" : "მარაგში არ არის"}
            </span>
          </div>

          <div className="mt-6 flex flex-wrap gap-3">
            {product.url ? (
              /* Out-of-stock items still link out — the shop page is where
                 restock and full specs live. */
              <a
                href={product.url}
                target="_blank"
                rel="noopener noreferrer"
                className={
                  product.stock
                    ? "alta-corners bg-alta-purple px-7 py-3.5 text-sm font-bold text-white transition hover:bg-alta-700"
                    : "alta-corners border border-alta-200 bg-white px-7 py-3.5 text-sm font-bold text-alta-purple-deep transition hover:bg-alta-50"
                }
              >
                {product.stock ? "შეძენა alta.ge-ზე" : "ნახეთ alta.ge-ზე"}
              </a>
            ) : (
              <button
                type="button"
                disabled
                className="alta-corners bg-alta-200 px-7 py-3.5 text-sm font-bold text-alta-400"
              >
                მიუწვდომელია
              </button>
            )}
            <a
              href="tel:+995322380038"
              className="alta-corners border border-alta-200 bg-white px-7 py-3.5 text-sm font-bold text-alta-purple-deep transition hover:bg-alta-50"
            >
              დარეკეთ შესაკვეთად
            </a>
          </div>

          <ul className="mt-7 space-y-3">
            {benefits.map((b) => (
              <li key={b.text} className="flex items-center gap-3">
                <AltaIcon name={b.icon} size="sm" />
                <span className="text-sm text-alta-700">{b.text}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Specs */}
      <section className="mt-14">
        <h2 className="text-lg font-bold text-alta-purple-deep">
          მახასიათებლები
        </h2>
        <SpecTable specs={product.specs} />
      </section>

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
