import type { NextConfig } from "next";
import packageJson from "./package.json";

const nextConfig: NextConfig = {
  // Enable standalone output for self-contained server deployment
  // This creates a minimal server that can run without node_modules
  output: "standalone",
  env: {
    NEXT_PUBLIC_APP_VERSION: packageJson.version,
  },
};

export default nextConfig;
