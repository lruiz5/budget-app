import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Enable standalone output for self-contained server deployment
  // This creates a minimal server that can run without node_modules
  output: "standalone",
};

export default nextConfig;
