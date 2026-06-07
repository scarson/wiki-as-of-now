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
import { StubResearchProvider } from "../../src/research/stub-provider";
import { fetchSourceText } from "../../src/research/source-fetch";
import { GATE_VERSION } from "../../src/safelane/eligibility";
import type { ResearchInput } from "../../src/research/provider";

// ---------------------------------------------------------------------------
// Env
// ---------------------------------------------------------------------------

interface ResearchWorkerEnv {
  DB: D1Database;
  RESEARCH_QUEUE: Queue<ResearchMessage>;
}

// ---------------------------------------------------------------------------
// Deps factory
// ---------------------------------------------------------------------------

function makeDeps(env: ResearchWorkerEnv): ResearchConsumerDeps {
  const db = d1Executor(env.DB);
  return {
    researchClaim: (input: ResearchInput) => researchClaim(input, {
      // WARNING: StubResearchProvider yields terminal no_proposals packs which are PK-poison.
      // Because has() is provider-agnostic (PK = claimKey + source_revision_id), any stub pack
      // committed here permanently blocks real research for that revision. A real provider MUST
      // clean up stub packs before any scheduled cron is enabled (see design residuals/preconditions, spec §8).
      provider: new StubResearchProvider(),
      // The Workers runtime always provides a non-null body for non-opaque fetch responses;
      // the cast aligns the global fetch signature with FetchImpl's stricter non-null body contract.
      fetchSource: (url: string) => fetchSourceText(url, { fetchImpl: fetch as Parameters<typeof fetchSourceText>[1]["fetchImpl"], now: new Date() }),
      now: new Date(),
      maxProposals: DEFAULT_MAX_PROPOSALS,
      perHostCap: DEFAULT_PER_HOST_CAP,
    }),
    packStore: makeResearchPackStore(db),
    audit: makeAuditLog(db),
    now: new Date(),
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
