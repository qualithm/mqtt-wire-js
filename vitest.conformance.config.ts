import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    globals: false,
    include: ["src/__tests__/conformance/**/*.spec.ts"],
    exclude: ["**/node_modules/**", "**/dist/**"],
    testTimeout: 30000,
    hookTimeout: 30000,
    // Conformance tests run sequentially to avoid port conflicts
    sequence: {
      concurrent: false
    },
    fileParallelism: false
  }
})
