import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  distDir: ".next-build",
  turbopack: {
    root: __dirname,
  },
};

export default nextConfig;
