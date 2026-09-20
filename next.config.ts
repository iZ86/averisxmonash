import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Turbopack mis-bundles one of its dependencies ("Queue is not a constructor"), so let Node load it.
  serverExternalPackages: ["searoute-js"],
};

export default nextConfig;
