import type { NextConfig } from "next";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const workspaceRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");

const nextConfig: NextConfig = {
  outputFileTracingRoot: workspaceRoot,
  outputFileTracingIncludes: {
    "/*": ["../../data/**/*"]
  },
  transpilePackages: ["@entas/catalog", "@entas/pricing-engine", "@entas/ui", "@entas/validation"]
};

export default nextConfig;
