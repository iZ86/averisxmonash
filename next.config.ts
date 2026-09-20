import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      // Review queue and Gmail inbox were merged into Batches.
      { source: "/review", destination: "/batches?tab=review", permanent: false },
      { source: "/review/:path*", destination: "/batches?tab=review", permanent: false },
      { source: "/inbox", destination: "/batches", permanent: false },
      { source: "/inbox/:path*", destination: "/batches", permanent: false },
    ];
  },
};

export default nextConfig;
