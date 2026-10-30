import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    setupFiles: ["test/vitest.setup.ts"],
    globals: false,
    // CLI tests spawn `bun run bin/pi-tube.ts` several times per case; cold starts on CI runners exceed 10 s.
    testTimeout: 30_000,
    hookTimeout: 30_000,
    restoreMocks: true,
    clearMocks: true,
  },
});
