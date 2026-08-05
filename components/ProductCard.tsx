import Link from "next/link";
import ProductImage from "./ProductImage";
import type { Product } from "@/lib/types";
import { discountPercent, formatPrice } from "@/lib/format";
import { categoryLabel, subcategoryLabel } from "@/lib/catalog";

export default function ProductCard({
  product,
  query = "",
}: {
  product: Product;
  /** current filter query string, so "back" returns to the same view */
  query?: string;
}) {
  const discount = discountPercent(product.old_price, product.promo_price);

  return (
    <article className="alta-corners group relative flex flex-col overflow-hidden border border-alta-100 bg-white transition hover:border-alta-300 hover:shadow-[0_12px_32px_-12px_rgb(61_41_86_/_0.28)]">
      <div className="relative aspect-square overflow-hidden bg-white">
        <ProductImage
          src={product.image}
          alt={product.title}
          sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
          className="object-contain p-[13%] transition duration-300 group-hover:scale-[1.04]"
        />

        {discount > 0 && (
          <span className="alta-corners absolute left-3 top-3 z-10 bg-alta-teal px-2.5 py-1 text-xs font-bold text-alta-purple-deep">
            −{discount}%
          </span>
        )}

        {!product.stock && (
          <span className="absolute inset-0 grid place-items-center bg-white/70 backdrop-blur-[1px]">
            <span className="alta-corners bg-alta-purple-deep px-3 py-1.5 text-sm font-bold text-white">
              მარაგში არ არის
            </span>
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col p-4">
        <p className="text-[11px] font-medium uppercase tracking-wide text-alta-400">
          {categoryLabel(product.category)} ·{" "}
          {subcategoryLabel(product.category, product.subcategory)}
        </p>

        <h3 className="mt-1.5 text-sm font-semibold leading-snug text-alta-purple-deep">
          <Link
            href={`/product/${product.id}${query}`}
            className="before:absolute before:inset-0 focus-visible:outline-none"
          >
            {product.title}
          </Link>
        </h3>

        <div className="mt-auto pt-4">
          <div className="flex items-baseline gap-2">
            <span className="text-lg font-bold text-alta-purple">
              {formatPrice(product.promo_price)}
            </span>
            {discount > 0 && (
              <span className="text-sm font-medium text-alta-300 line-through">
                {formatPrice(product.old_price)}
              </span>
            )}
          </div>
          {discount > 0 ? (
            <p className="mt-1 text-xs font-semibold text-alta-crimson">
              დაზოგეთ {formatPrice(product.old_price - product.promo_price)}
            </p>
          ) : (
            <p className="mt-1 text-xs font-medium text-alta-400">
              მწარმოებლის ფასი
            </p>
          )}
        </div>
      </div>
    </article>
  );
}
