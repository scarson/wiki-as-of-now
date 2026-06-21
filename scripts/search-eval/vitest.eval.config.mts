// ABOUTME: Isolated vitest config for the one-off LIVE Brave-vs-Tavily search eval.
// ABOUTME: Includes ONLY run.ts (not *.test.ts, so the normal suite/CI never collects it); no pristine/network setup. Run: pnpm exec vitest run -c scripts/search-eval/vitest.eval.config.mts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["scripts/search-eval/run.ts"],
    testTimeout: 20 * 60_000,
    hookTimeout: 20 * 60_000,
  },
});
