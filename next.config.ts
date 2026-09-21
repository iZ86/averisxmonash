import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Turbopack mis-bundles one of its dependencies ("Queue is not a constructor"), so let Node load it.
  serverExternalPackages: ["searoute-js"],
  async redirects() {
    return [
      // The Gmail inbox was merged into Batches.
      { source: "/inbox", destination: "/batches", permanent: false },
      { source: "/inbox/:path*", destination: "/batches", permanent: false },
    ];
  },
};

export default nextConfig;
