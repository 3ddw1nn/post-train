import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Minimal, self-contained server bundle for Docker deploys (Fly/Railway/Render).
  output: "standalone",
  // Pin the workspace root to this repo — a stray lockfile in the parent
  // home directory otherwise makes Next.js infer the wrong root.
  outputFileTracingRoot: path.join(__dirname),
};

export default nextConfig;
