import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@entas/ui"],
  async headers() {
    return [{ source: "/:path*", headers: [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "X-Frame-Options", value: "DENY" },
      { key: "Referrer-Policy", value: "no-referrer" },
      { key: "Content-Security-Policy", value: "default-src 'self'; frame-ancestors 'none'; object-src 'none'; base-uri 'self'" }
    ] }];
  }
};

export default nextConfig;
