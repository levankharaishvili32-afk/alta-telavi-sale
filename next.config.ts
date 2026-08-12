import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // Product photos come from the shop's CDN via the Meta catalog feed.
    // <ProductImage> renders them with `unoptimized`, so this entry only
    // matters if you switch that off and route them through the optimizer.
    remotePatterns: [
      { protocol: "https", hostname: "imgstore.alta.ge" },
      { protocol: "https", hostname: "*.alta.ge" },
    ],
    // Needed for the local /img/placeholder.svg fallback.
    dangerouslyAllowSVG: true,
    contentDispositionType: "attachment",
    contentSecurityPolicy: "default-src 'self'; script-src 'none'; sandbox;",
  },

  /**
   * The product feed's Content-Type, stated rather than inferred.
   *
   * `public/feed.xml` is served by the host's static file handler, which picks
   * a type from the extension — and Meta's Commerce Manager rejects the URL
   * outright ("does not link to supported file") unless that type is one it
   * recognises as XML. The file itself was always valid; nothing about it is
   * visible to the importer except this header, so it should not be left to a
   * CDN's mime table to guess.
   *
   * `text/xml` over `application/rss+xml`: it is the type every feed reader,
   * validator and browser treats as XML text, and being a text type it renders
   * in a browser instead of downloading — which is also how you check it.
   *
   * Next.js matches header rules before the filesystem, so this applies to the
   * static file.
   */
  async headers() {
    return [
      {
        source: "/feed.xml",
        headers: [
          { key: "Content-Type", value: "text/xml; charset=utf-8" },
          // Regenerated on every deploy, and a deploy purges the edge cache,
          // so an hour at the edge costs nothing and spares the origin Meta's
          // scheduled fetches.
          {
            key: "Cache-Control",
            value: "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400",
          },
          // It is for Meta's importer, not for search results.
          { key: "X-Robots-Tag", value: "noindex" },
        ],
      },
    ];
  },
};

export default nextConfig;
