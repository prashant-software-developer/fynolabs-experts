import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // PGlite (the local dev database) ships WebAssembly; load it from node_modules, don't bundle it.
  serverExternalPackages: ["@electric-sql/pglite"],
  poweredByHeader: false,
  eslint: { ignoreDuringBuilds: true },
  experimental: {
    // CV uploads and CSV imports go through server actions.
    serverActions: { bodySizeLimit: "12mb" },
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "same-origin" },
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
        ],
      },
    ];
  },
};

export default nextConfig;
