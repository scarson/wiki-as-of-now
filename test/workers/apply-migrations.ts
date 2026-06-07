// ABOUTME: Workers-pool setup — applies the shipped D1 migrations to the Miniflare D1 before each test file.
// ABOUTME: Migrations are read Node-side (vitest.workers.config.mts) and injected as env.TEST_MIGRATIONS.
import { applyD1Migrations } from "cloudflare:test";
import { beforeAll } from "vitest";
import { testEnv } from "./test-env";

beforeAll(async () => {
  await applyD1Migrations(testEnv.DB, testEnv.TEST_MIGRATIONS);
});
