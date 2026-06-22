import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@napi-rs/canvas", "pdf-parse"],
  outputFileTracingIncludes: {
    "*": [
      "node_modules/.prisma/client/**/*",
      "node_modules/@napi-rs/canvas/**/*",
      "node_modules/@napi-rs/canvas-linux-x64-gnu/**/*",
      "node_modules/@napi-rs/canvas-linux-x64-musl/**/*",
      "node_modules/pdf-parse/**/*",
      "node_modules/pdfjs-dist/**/*",
    ],
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
