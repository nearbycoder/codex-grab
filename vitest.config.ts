import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "jsdom",
    include: [
      "packages/**/*.test.ts",
      "packages/**/*.test.tsx",
      "promo-remotion/**/*.test.ts",
      "promo-remotion/**/*.test.tsx",
      "test/**/*.test.ts"
    ]
  }
});
