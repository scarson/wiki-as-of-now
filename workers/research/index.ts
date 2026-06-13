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
import { researchClaim, DEFAULT_MAX_PROPOSALS, DEFAULT_PER_HOST_CAP } from "../../src/research/pipeline";
import { selectResearchProvider } from "../../src/research/select-provider";
import { fetchSourceText, type FetchImpl } from "../../src/research/source-fetch";
import { GATE_VERSION } from "../../src/safelane/eligibility";
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
}

// ---------------------------------------------------------------------------
// Deps factory
// ---------------------------------------------------------------------------

function makeDeps(env: ResearchWorkerEnv): ResearchConsumerDeps {
  const db = d1Executor(env.DB);
  const now = new Date();
  // The Workers runtime always provides a non-null body for non-opaque fetch responses;
  // the cast aligns the global fetch signature with FetchImpl's stricter non-null body contract.
  const fetchSource = (url: string) => fetchSourceText(url, { fetchImpl: fetch as FetchImpl, now });
  // Env-gated provider selection (Task 1.10): default stays on the stub (CC-7) unless RESEARCH_PROVIDER=workers-ai.
  // The deployed default is NOT flipped here — enabling the real provider end-to-end is a human-confirmed Phase 7 step.
  // The fixture (node:fs) search path is NEVER reachable from this bundle: with no BRAVE_API_KEY and no searchOverride
  // the selector falls back to an empty search, keeping node:fs out of the worker (CC-5/§5.6).
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
  };
}

// ---------------------------------------------------------------------------
// Worker export
// ---------------------------------------------------------------------------

export default {
  async scheduled(_controller: ScheduledController, env: ResearchWorkerEnv, _ctx: ExecutionContext): Promise<void> {
    const db = d1Executor(env.DB);
    const msgs = await selectResearchSeeds(db, { gateVersion: GATE_VERSION, limit: SEED_BATCH_LIMIT });
    // Adapt Queue.sendBatch (returns QueueSendBatchResponse) to the void-return contract enqueueResearchBatch expects.
    const queueAdapter = {
      sendBatch: async (messages: { body: ResearchMessage }[]) => { await env.RESEARCH_QUEUE.sendBatch(messages); },
    };
    await enqueueResearchBatch(queueAdapter, msgs);
  },
  async queue(batch: MessageBatch<ResearchMessage>, env: ResearchWorkerEnv, _ctx: ExecutionContext): Promise<void> {
    await processBatch(batch, makeDeps(env));
  },
} satisfies ExportedHandler<ResearchWorkerEnv, ResearchMessage>;
