// ABOUTME: Vitest configuration for unit and integration tests.
// ABOUTME: Uses the Node environment so native modules (better-sqlite3) load correctly.
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    setupFiles: ["./test/setup/pristine.ts"],
    // test/workers/** runs in the separate workerd pool (vitest.workers.config.mts), not the Node pool.
    // .claude/** holds git worktrees — each a full repo copy whose tests must not be swept into this suite.
    exclude: ["**/node_modules/**", "**/dist/**", "test/workers/**", ".claude/**"],
    coverage: {
      provider: "v8",
      // Cover application/library source only — exclude the Next.js UI shell,
      // ambient declarations, and pure type modules (no executable lines).
      include: ["src/**/*.ts"],
      exclude: ["src/app/**", "src/**/*.d.ts"],
      reporter: ["text", "html"],
    },
  },
});
