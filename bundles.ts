import bundlesJson from "@/data/bundles.json";
import { getProduct } from "./catalog";

/**
 * One accessory suggested alongside a campaign product. Written at build time
 * by `npm run bundles`; nothing here is fetched in the browser.
 */
export type BundleItem = {
  id: string;
  /**
   * `local` — the accessory is itself a campaign product, so it is shown at
   * this campaign's price and opens in a quick-view without leaving the site.
   * `alta` — it only exists in the wider alta.ge catalog, so it is shown at
   * catalog price and links out.
   */
  source: "local" | "alta";
  type: string | null;
  type_label: string | null;
  title: string;
  brand: string | null;
  image: string | null;
  href: string | null;
  price: number;
  /** pre-discount price, when there is a discount to show */
  old_price: number | null;
  score: number;
  why: string[];
};

/** A local accessory carries enough detail for the quick-view to stand alone. */
export type BundleItemResolved = BundleItem & {
  specs?: Record<string, string>;
  subtitle?: string | null;
};

const BUNDLES = bundlesJson as unknown as Record<string, BundleItem[]>;

/**
 * Accessories for one product, with local entries enriched from the catalog so
 * the quick-view has specs to show. Returns an empty array when the product
 * has no qualifying accessories — the card is then not rendered at all.
 */
export function bundleFor(productId: string): BundleItemResolved[] {
  const items = BUNDLES[productId] ?? [];
  return items.map((item) => {
    if (item.source !== "local") return item;
    const product = getProduct(item.id);
    if (!product) return item;
    return {
      ...item,
      // Trust the catalog over the snapshot in bundles.json: prices move.
      title: product.title,
      image: product.image,
      price: product.promo_price,
      old_price:
        product.old_price > product.promo_price ? product.old_price : null,
      subtitle: product.brand,
      specs: Object.fromEntries(Object.entries(product.specs).slice(0, 5)),
    };
  });
}

export const bundledProductIds = Object.keys(BUNDLES);
