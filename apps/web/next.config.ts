import type { NextConfig } from "next";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const workspaceRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");
const securityHeaders = [
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      `script-src 'self' 'unsafe-inline'${process.env.NODE_ENV === "production" ? "" : " 'unsafe-eval'"}`,
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https://bayi.euro-mix.com.tr https://www.mir-san.com.tr",
      "media-src 'self' blob:",
      "font-src 'self' data:",
      "connect-src 'self' https://*.ziraatpay.com.tr",
      "form-action 'self' https://*.ziraatpay.com.tr",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "object-src 'none'",
      ...(process.env.NODE_ENV === "production" ? ["upgrade-insecure-requests"] : [])
    ].join("; ")
  },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-DNS-Prefetch-Control", value: "off" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  ...(process.env.NODE_ENV === "production" ? [{ key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" }] : [])
];
const privatePageHeaders = [
  { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" },
  { key: "Cache-Control", value: "private, no-store, max-age=0" }
];

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: "16mb"
    }
  },
  outputFileTracingRoot: workspaceRoot,
  outputFileTracingIncludes: {
    "/*": ["../../data/**/*"]
  },
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      ...["/admin/:path*", "/account/:path*", "/cart/:path*", "/checkout/:path*", "/login", "/orders/:path*", "/quote/:path*", "/quick-order/:path*", "/api/:path*"]
        .map((source) => ({ source, headers: privatePageHeaders }))
    ];
  },
  transpilePackages: ["@entas/catalog", "@entas/pricing-engine", "@entas/ui", "@entas/validation"]
};

export default nextConfig;
