import bannersJson from "@/data/banners.json";

export type BannerImage = {
  src: string;
  width: number;
  height: number;
};

export type Banner = {
  id: string;
  alt: string;
  /** wide crop, used from the `sm` breakpoint up */
  desktop: BannerImage;
  /** shorter crop for narrow screens */
  mobile: BannerImage;
  /** optional destination; a banner with no href is decorative */
  href?: string;
};

/**
 * Campaign banners, in display order. Add a slide by dropping both crops into
 * `public/banners/` and appending an entry to `data/banners.json` — nothing in
 * the component needs to change.
 */
export const banners = bannersJson as Banner[];
