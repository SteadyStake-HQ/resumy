import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  outputFileTracingIncludes: {
    "*": ["node_modules/.prisma/client/**/*"],
  },
  outputFileTracingExcludes: {
    "*": [".local/**/*"],
  },
  experimental: {
    // Leave enough headroom for multipart overhead above our 8 MB app-level file limit.
    proxyClientMaxBodySize: "20mb",
  },
};

export default nextConfig;
