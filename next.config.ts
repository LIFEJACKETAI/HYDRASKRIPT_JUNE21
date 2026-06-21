import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  /* config options here */
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
  // Increase server timeout for long-running generation tasks
  serverExternalPackages: ['z-ai-web-dev-sdk'],
  experimental: {},
};

export default nextConfig;
