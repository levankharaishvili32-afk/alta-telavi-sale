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
  stock: boolean;
  specs: Record<string, string>;
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
