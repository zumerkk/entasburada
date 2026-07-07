import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@entas/catalog", "@entas/pricing-engine", "@entas/ui", "@entas/validation"]
};

export default nextConfig;
