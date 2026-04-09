import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@turf/concave", "@turf/helpers", "@turf/meta", "@turf/invariant", "@turf/clone", "@turf/distance", "@turf/tin"],
  turbopack: {
    root: __dirname,
  },
};

export default nextConfig;
