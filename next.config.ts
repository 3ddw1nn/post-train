import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Minimal, self-contained server bundle for Docker deploys (Fly/Railway/Render).
  output: "standalone",
};

export default nextConfig;
