// ABOUTME: Vitest config for the workerd (Miniflare) test pool — proves real Cloudflare bindings.
// ABOUTME: Runs test/workers/** against the research worker's wrangler config (real D1 + Queues), migrations applied.
// This config is .mts (not .ts): @cloudflare/vitest-pool-workers is ESM-only; a .ts config is bundled as CJS and fails to load it.
import { defineConfig } from "vitest/config";
import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-pool-workers";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Read the shipped D1 migrations (Node side) so the setup file can apply them to the
// Miniflare D1 inside workerd via applyD1Migrations(env.DB, env.TEST_MIGRATIONS).
const rootDir = path.dirname(fileURLToPath(import.meta.url));
const migrations = await readD1Migrations(path.join(rootDir, "migrations"));

export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: "./workers/research/wrangler.jsonc" },
      miniflare: {
        // RESEARCH_KILL_SWITCH is empty here so research is ENABLED by default in tests; the kill-switch
        // test overrides it per-call (passing "1" to worker.queue) to prove the consumer pauses.
        bindings: { TEST_MIGRATIONS: migrations, RESEARCH_KILL_SWITCH: "" },
      },
    }),
  ],
  resolve: {
    // src/app/** route handlers use the "@/*" → "./src/*" alias (the Next.js convention, matching
    // tsconfig paths). Next's bundler resolves it in production; the workerd pool imports those
    // route handlers directly, so it needs the same alias to resolve their imports.
    alias: { "@": path.join(rootDir, "src") },
  },
  test: {
    include: ["test/workers/**/*.test.ts"],
    setupFiles: ["./test/workers/apply-migrations.ts"],
  },
});
