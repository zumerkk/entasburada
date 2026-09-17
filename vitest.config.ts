import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  esbuild: { jsx: "automatic" },
  test: {
    // External macOS volumes create AppleDouble metadata beside .ts files.
    exclude: [...configDefaults.exclude, "**/._*"],
  },
});
