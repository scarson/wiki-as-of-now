// ABOUTME: Vitest config for the workerd (Miniflare) test pool — proves real Cloudflare bindings.
// ABOUTME: Runs test/workers/** against the research worker's wrangler config (real D1 + Queues), migrations applied.
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
        bindings: { TEST_MIGRATIONS: migrations },
      },
    }),
  ],
  test: {
    include: ["test/workers/**/*.test.ts"],
    setupFiles: ["./test/workers/apply-migrations.ts"],
  },
});
