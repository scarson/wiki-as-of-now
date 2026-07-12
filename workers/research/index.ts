// ABOUTME: Dedicated background worker consuming the research Queue and cron-seeding easy-win candidates.
// ABOUTME: Shares the web app's D1 database; no fetch handler — scheduled + queue only.

import { d1Executor } from "../../src/db/client";
import { makeAuditLog } from "../../src/db/audit-log";
import { selectResearchSeeds } from "../../src/queue/seed";
import {
  enqueueResearchBatch,
  makeResearchPackStore,
  SEED_BATCH_LIMIT,
  type ResearchMessage,
  type ResearchConsumerDeps,
} from "../../src/queue/research-jobs";
import { processBatch } from "../../src/queue/process-batch";
import { isResearchKillSwitchOn } from "../../src/research/kill-switch";
import { researchClaim, DEFAULT_MAX_PROPOSALS, DEFAULT_PER_HOST_CAP } from "../../src/research/pipeline";
import { selectResearchProvider } from "../../src/research/select-provider";
import { fetchSourceText, type FetchImpl } from "../../src/research/source-fetch";
import { GATE_VERSION } from "../../src/safelane/eligibility";
import { loadQuotaConfig } from "../../src/quota/config";
import type { ResearchInput } from "../../src/research/provider";

// ---------------------------------------------------------------------------
// Env
// ---------------------------------------------------------------------------

interface ResearchWorkerEnv {
  DB: D1Database;
  RESEARCH_QUEUE: Queue<ResearchMessage>;
  // The AI binding is NOT surfaced by cf-typegen (it reads only the root config, CC-9) — type it by hand here.
  AI: Ai;
  RESEARCH_PROVIDER?: string;
  BRAVE_API_KEY?: string;
  // Admin research kill-switch. Set via `wrangler secret put RESEARCH_KILL_SWITCH` (or a plain var) on the
  // research worker. Absent ⇒ research enabled; an explicit truthy value pauses the consumer + scheduler.
  RESEARCH_KILL_SWITCH?: string;
  // Per-user + global daily pack-insert caps (the count-at-commit quota). Absent ⇒ safe defaults.
  QUOTA_PER_USER_DAILY?: string;
  QUOTA_GLOBAL_DAILY?: string;
}

// ---------------------------------------------------------------------------
// Deps factory
// ---------------------------------------------------------------------------

function makeDeps(env: ResearchWorkerEnv): ResearchConsumerDeps {
  const db = d1Executor(env.DB);
  const now = new Date();
  // The Workers runtime always provides a non-null body for non-opaque fetch responses;
  // the cast aligns the global fetch signature with FetchImpl's stricter non-null body contract.
  // The lambda (not a detached `fetch` reference) keeps the call receiver-neutral: workerd's
  // global fetch rejects a re-receivered invocation with TypeError: Illegal invocation.
  const fetchSource = (url: string) =>
    fetchSourceText(url, { fetchImpl: ((input, init) => fetch(input, init)) as FetchImpl, now });
  // Env-gated provider selection (Task 1.10): default stays on the stub (CC-7) unless RESEARCH_PROVIDER=workers-ai.
  // The deployed default is NOT flipped here — enabling the real provider end-to-end is a human-confirmed Phase 7 step.
  // The fixture (node:fs) search path is NEVER reachable from this bundle: with no BRAVE_API_KEY and no searchOverride
  // the selector falls back to a no-search backend that throws ProviderUnavailableError (so research routes through the
  // retryable provider_unavailable path and persists nothing), keeping node:fs out of the worker (CC-5/§5.6).
  const provider = selectResearchProvider({
    AI: env.AI,
    RESEARCH_PROVIDER: env.RESEARCH_PROVIDER,
    BRAVE_API_KEY: env.BRAVE_API_KEY,
    fetchSource,
  });
  return {
    researchClaim: (input: ResearchInput) => researchClaim(input, {
      provider,
      fetchSource,
      now,
      maxProposals: DEFAULT_MAX_PROPOSALS,
      perHostCap: DEFAULT_PER_HOST_CAP,
    }),
    packStore: makeResearchPackStore(db),
    audit: makeAuditLog(db),
    now,
    quotaConfig: loadQuotaConfig(env),
  };
}

// ---------------------------------------------------------------------------
// Worker export
// ---------------------------------------------------------------------------

export default {
  async scheduled(_controller: ScheduledController, env: ResearchWorkerEnv, _ctx: ExecutionContext): Promise<void> {
    // Kill-switch: when research is paused, the scheduler enqueues nothing (no new work to drain).
    if (isResearchKillSwitchOn(env)) return;
    const db = d1Executor(env.DB);
    const msgs = await selectResearchSeeds(db, { gateVersion: GATE_VERSION, limit: SEED_BATCH_LIMIT });
    // Adapt Queue.sendBatch (returns QueueSendBatchResponse) to the void-return contract enqueueResearchBatch expects.
    const queueAdapter = {
      sendBatch: async (messages: { body: ResearchMessage }[]) => { await env.RESEARCH_QUEUE.sendBatch(messages); },
    };
    await enqueueResearchBatch(queueAdapter, msgs);
  },
  async queue(batch: MessageBatch<ResearchMessage>, env: ResearchWorkerEnv, _ctx: ExecutionContext): Promise<void> {
    // Kill-switch: pause in-flight research. Retry (not ack) every message so paused work is not lost —
    // it resumes when the switch is turned off. Nothing is researched or persisted while paused.
    if (isResearchKillSwitchOn(env)) {
      for (const m of batch.messages) m.retry();
      return;
    }
    await processBatch(batch, makeDeps(env));
  },
} satisfies ExportedHandler<ResearchWorkerEnv, ResearchMessage>;
