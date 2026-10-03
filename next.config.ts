import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["pdf-parse", "pdfjs-dist", "mammoth", "cloudflared"],
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  experimental: {
    proxyClientMaxBodySize: "100mb",
  },
  turbopack: {},
  devIndicators: false,
  webpack: (config, { dev }) => {
    if (dev) {
      config.watchOptions = {
        ...(config.watchOptions || {}),
        ignored: ["**/node_modules/**", "**/.git/**", "**/data/**", "**/.next/**", "**/.vercel/**"],
      };
    }
    return config;
  },
};

export default nextConfig;
