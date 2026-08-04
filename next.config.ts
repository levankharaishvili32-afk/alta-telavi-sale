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
};

export default nextConfig;
