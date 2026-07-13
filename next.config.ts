import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  reactCompiler: true,
  experimental: {
    serverActions: {
      // Bulk CSV imports upload the whole file through a server action.
      bodySizeLimit: "5mb",
    },
  },
};

export default nextConfig;
