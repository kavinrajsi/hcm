import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  reactCompiler: true,
  experimental: {
    // forbidden(): a wrong role renders app/forbidden.tsx with a 403
    // instead of throwing an error that lands in the runtime logs.
    authInterrupts: true,
    serverActions: {
      // Bulk CSV imports upload the whole file through a server action.
      bodySizeLimit: "5mb",
    },
  },
};

export default nextConfig;
