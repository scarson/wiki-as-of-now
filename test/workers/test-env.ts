// ABOUTME: Typed accessor for the research worker's Miniflare test bindings (cloudflare:test env).
// ABOUTME: The pool's env is the research worker's env (DB + RESEARCH_QUEUE) plus the injected TEST_MIGRATIONS.
import { env } from "cloudflare:test";
import type { D1Migration } from "@cloudflare/vitest-pool-workers";
import type { ResearchMessage } from "../../src/queue/research-jobs";

interface ResearchTestEnv {
  DB: D1Database;
  RESEARCH_QUEUE: Queue<ResearchMessage>;
  TEST_MIGRATIONS: D1Migration[];
}

/** The cloudflare:test env, typed for the research worker's bindings. */
export const testEnv = env as unknown as ResearchTestEnv;
