export type Product = {
  id: string;
  title: string;
  category: string;
  subcategory: string;
  brand: string;
  image: string;
  /** extra photos from the feed, shown as thumbnails on the detail page */
  gallery?: string[];
  /** canonical product page on the shop, when the source feed provides one */
  url?: string | null;
  old_price: number;
  promo_price: number;
  /**
   * Recomputed from the two prices by `npm run scrape`. The UI still derives it
   * with `discountPercent()` so a hand-edited price can never disagree with the
   * badge; this field is for anything reading the JSON directly.
   */
  discount_pct?: number;
  stock: boolean;
  /**
   * Canonical, ordered attributes — the keys listed for this product's scope in
   * `data/spec-schema.json`. These are what the comparison table renders.
   */
  specs: Record<string, string>;
  /**
   * Everything else the scrape found. Kept verbatim so nothing is lost, shown
   * on the detail page under the canonical rows, never compared.
   */
  specs_other?: Record<string, string>;
  /** where alta.ge files the product — informational, filtering uses the CSV */
  alta_breadcrumb?: string[];
  alta_category?: string | null;
  /** free-text description, when the shop supplies one beyond the specs */
  description?: string | null;
};

export type Subcategory = {
  id: string;
  label: string;
};

export type Category = {
  id: string;
  label: string;
  subcategories: Subcategory[];
};
