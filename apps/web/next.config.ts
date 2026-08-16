import type { NextConfig } from "next";

// Next.js image optimization proxy refuses to fetch from private/loopback IPs
// (SSRF guard). When storage is on localhost we set unoptimized=true so the
// browser fetches presigned MinIO URLs directly — MinIO CORS allows it.
// In production set GARAGE_PUBLIC_URL to a real hostname and optimization
// re-enables automatically.
const storageIsLocal =
  !process.env.GARAGE_PUBLIC_URL ||
  /localhost|127\.0\.0\.1/.test(process.env.GARAGE_PUBLIC_URL);

const nextConfig: NextConfig = {
  output: "standalone",
  compress: true,
  poweredByHeader: false,
  images: {
    unoptimized: storageIsLocal,
    formats: ["image/avif", "image/webp"],
    remotePatterns: [
      { protocol: "http",  hostname: "**" },
      { protocol: "https", hostname: "**" },
    ],
  },
  reactStrictMode: true,
  experimental: {
    optimizePackageImports: ["lucide-react", "framer-motion", "date-fns", "uuid"],
  },
  // Content-Security-Policy is set per-request in middleware.ts (needs a nonce).
  // Setting it here too would make browsers enforce the intersection of two
  // independently-written policies — fragile. Everything else is static.
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // camera=(self) allows the in-page camera capture used by trade-in/repair
          // photo uploads (CameraCaptureModal) — an empty allowlist here blocks
          // getUserMedia() outright, before the browser ever shows a permission prompt.
          { key: "Permissions-Policy", value: `camera=(self), microphone=(), geolocation=(), payment=(self "https://js.stripe.com")` },
          { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" },
          { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
        ],
      },
    ];
  },
};

export default nextConfig;
