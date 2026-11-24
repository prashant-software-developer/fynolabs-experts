import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // PGlite (tests and local smoke tests only) ships WebAssembly; load it from node_modules, don't bundle it.
  devIndicators: false,
  serverExternalPackages: ["@electric-sql/pglite"],
  poweredByHeader: false,
  eslint: { ignoreDuringBuilds: true },
  experimental: {
    // CV uploads and CSV imports go through server actions.
    serverActions: { bodySizeLimit: "12mb" },
  },
  // The team app moved under /admin (Phase 2); old links keep working.
  async redirects() {
    return ["experts", "requirements", "submissions", "placements", "partners", "import", "settings"].flatMap((p) => [
      { source: `/${p}`, destination: `/admin/${p}`, permanent: false },
      { source: `/${p}/:path*`, destination: `/admin/${p}/:path*`, permanent: false },
    ]);
  },
  async headers() {
    const noindex = { key: "X-Robots-Tag", value: "noindex, nofollow" };
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          // Share links keep their full address (utm tags) inside the site; other sites get the origin only.
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
      // Only the job board and job pages are for search engines.
      ...["/admin/:path*", "/admin", "/me/:path*", "/me", "/api/:path*", "/signin", "/verify-email", "/forgot-password", "/reset-password", "/account/:path*", "/db-not-set-up", "/no-access", "/team-only", "/auth/:path*"].map((source) => ({ source, headers: [noindex] })),
    ];
  },
};

export default nextConfig;
