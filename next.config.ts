import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Minimal, self-contained server bundle for Docker deploys (Fly/Railway/Render).
  output: "standalone",
  // Pin the workspace root to this repo — a stray lockfile in the parent
  // home directory otherwise makes Next.js infer the wrong root.
  outputFileTracingRoot: path.join(__dirname),
  transpilePackages: ["@shadergradient/react"],
  async redirects() {
    return [
      {
        source: "/tools/free-trend-finder",
        destination: "/tools/trend-finder",
        permanent: true,
      },
      {
        source: "/dashboard/tools/free-trend-finder",
        destination: "/dashboard/tools/trend-finder",
        permanent: true,
      },
      {
        source: "/api/tools/free-trends",
        destination: "/api/tools/trends",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
