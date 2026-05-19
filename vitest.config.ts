import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    setupFiles: ["test/vitest.setup.ts"],
    globals: false,
    testTimeout: 10_000,
    hookTimeout: 10_000,
    restoreMocks: true,
    clearMocks: true,
  },
});
