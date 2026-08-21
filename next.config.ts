import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  reactStrictMode: false,

  // ── Image optimization ──────────────────────────────────────────
  // Allow Unsplash images via next/image (automatic WebP/AVIF,
  // lazy loading, responsive sizes).
  images: {
    formats: ["image/avif", "image/webp"],
    remotePatterns: [
      { protocol: "https", hostname: "images.unsplash.com" },
    ],
    // Device sizes for responsive srcset
    deviceSizes: [360, 390, 414, 640, 750, 828, 1080, 1200, 1920],
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
    minimumCacheTTL: 86400, // 24h cache for optimized images
  },

  // ── Experimental: optimize heavy package imports ────────────────
  // Reduces bundle size by tree-shaking unused parts of large libs.
  experimental: {
    optimizePackageImports: [
      "lucide-react",
      "framer-motion",
      "@radix-ui/react-dialog",
      "@radix-ui/react-select",
      "@radix-ui/react-tabs",
      "@radix-ui/react-toast",
      "date-fns",
      "recharts",
    ],
  },

  // ── Allowed dev origins (sandbox preview) ──────────────────────
  // Allow cross-origin requests from the sandbox preview domain so the
  // HMR websocket and dev assets can be served without warnings/errors.
  allowedDevOrigins: [
    ".space-z.ai",
    "*.space-z.ai",
  ],

  // ── Compression ─────────────────────────────────────────────────
  compress: true,

  // ── Powered-by header removal (security + minor perf) ───────────
  poweredByHeader: false,

  // ── TypeScript build errors — strict (no ignoring) ──────────────
  typescript: {
    ignoreBuildErrors: false,
  },
};

export default nextConfig;
