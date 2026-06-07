// ABOUTME: Workers-pool integration tests — proves the research worker against REAL Miniflare D1 + Queues.
// ABOUTME: Covers happy-path delivery + atomic pack+audit commit on real D1, and scheduled() seed enqueue.
import { describe, it, expect, vi } from "vitest";
import worker from "../../workers/research/index";
import { testEnv } from "./test-env";
import { d1Executor } from "../../src/db/client";
import { upsertArticle } from "../../src/db/articles";
import { upsertVerdict } from "../../src/db/eligibility-verdicts";
import { computeClaimKey, getPack } from "../../src/db/research-packs";
import { makeAuditLog } from "../../src/db/audit-log";
import { GATE_VERSION } from "../../src/safelane/eligibility";
import type { ResearchMessage } from "../../src/queue/research-jobs";

const workerEnv = { DB: testEnv.DB, RESEARCH_QUEUE: testEnv.RESEARCH_QUEUE };

const PAGE_ID = 4242;
const REV_ID = 9001;
const SECTION = "History";
const SENTENCE = "The fleet will reach full strength by 2025.";
const YEAR = 2025;

/** Build a faithful single-message MessageBatch for the queue handler with ack/retry spies. */
function makeBatch(body: ResearchMessage) {
  const message = { id: "msg-1", timestamp: new Date(), body, attempts: 1, ack: vi.fn(), retry: vi.fn() };
  const batch = { queue: "research", messages: [message], ackAll: vi.fn(), retryAll: vi.fn() };
  return { batch, message };
}

const ctx = { waitUntil: () => {}, passThroughOnException: () => {} } as unknown as ExecutionContext;

describe("research worker — queue handler on real Miniflare D1", () => {
  it("happy-path delivery: a seeded claim is consumed → stub no_proposals pack + completion audit land atomically in real D1", async () => {
    const db = d1Executor(testEnv.DB);
    await upsertArticle(db, { pageId: PAGE_ID, title: "Test Article", revisionId: REV_ID, fetchedAt: new Date().toISOString() });

    const claimKey = await computeClaimKey(PAGE_ID, SECTION, SENTENCE, YEAR);
    const body: ResearchMessage = {
      claimKey,
      pageId: PAGE_ID,
      sourceRevisionId: REV_ID,
      input: { claimText: SENTENCE, sectionHeading: SECTION, year: YEAR, sourceRevisionId: REV_ID },
    };
    const { batch, message } = makeBatch(body);

    await worker.queue(batch as unknown as MessageBatch<ResearchMessage>, workerEnv, ctx);

    // The message was acked (terminal success), not retried.
    expect(message.ack).toHaveBeenCalledTimes(1);
    expect(message.retry).not.toHaveBeenCalled();

    // The pack landed in REAL D1 (stub → no_proposals terminal pack).
    const read = await getPack(db, claimKey, REV_ID);
    expect(read.state).toBe("found");
    if (read.state === "found") {
      expect(read.pack.status).toBe("no_proposals");
      expect(read.pack.modelVersion).toBe("fake-provider/0");
    }

    // The completion audit row landed in the SAME real D1 (atomic commit proven on D1, not just better-sqlite3).
    const rows = await makeAuditLog(db).read();
    const completed = rows.filter((r) => r.eventType === "research.completed" && (r.payload as { claimKey?: string }).claimKey === claimKey);
    expect(completed).toHaveLength(1);
  });
});

describe("research worker — genuine failure maps to retry() on real D1 (no production seam)", () => {
  it("a claim whose pageId has no parent article: commitTerminal FK fails inside the atomic batch → message retried, nothing persisted", async () => {
    // Induce a GENUINE failure with real components (an orphan-FK pack insert), NOT a contrived
    // production test-seam. The real DLQ *routing* after max_retries is exercised by the Node-pool
    // faithful-fake (process-batch.test.ts) + manual `wrangler` verification; end-to-end
    // redelivery-to-DLQ after max_retries is a named test residual — see
    // docs/plans/2026-06-07-research-queue-transport-plan.md §Discoveries.
    const db = d1Executor(testEnv.DB);
    const ORPHAN_PAGE_ID = 999999; // deliberately NOT inserted into articles → FK violation on the pack insert
    const claimKey = await computeClaimKey(ORPHAN_PAGE_ID, SECTION, SENTENCE, YEAR);
    const body: ResearchMessage = {
      claimKey,
      pageId: ORPHAN_PAGE_ID,
      sourceRevisionId: REV_ID,
      input: { claimText: SENTENCE, sectionHeading: SECTION, year: YEAR, sourceRevisionId: REV_ID },
    };
    const { batch, message } = makeBatch(body);

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    await worker.queue(batch as unknown as MessageBatch<ResearchMessage>, workerEnv, ctx);

    // The genuine FK failure → retry() (transient signal), never ack().
    expect(message.retry).toHaveBeenCalledTimes(1);
    expect(message.ack).not.toHaveBeenCalled();
    // A codes-only retry warn fired (no claim text leaked).
    expect(warnSpy).toHaveBeenCalled();
    expect(JSON.stringify(warnSpy.mock.calls)).not.toContain(SENTENCE);
    warnSpy.mockRestore();

    // Atomic: neither the pack nor a completion audit persisted in real D1.
    const read = await getPack(db, claimKey, REV_ID);
    expect(read.state).toBe("not_found");
    const rows = await makeAuditLog(db).read();
    const completed = rows.filter((r) => r.eventType === "research.completed" && (r.payload as { claimKey?: string }).claimKey === claimKey);
    expect(completed).toHaveLength(0);
  });
});

describe("research worker — scheduled handler on real Miniflare D1 + Queue", () => {
  it("scheduled() enqueues the selected easy-win seed(s) to RESEARCH_QUEUE", async () => {
    const db = d1Executor(testEnv.DB);
    const PID = 7777;
    const RID = 5005;
    await upsertArticle(db, { pageId: PID, title: "Seedable", revisionId: RID, fetchedAt: new Date().toISOString() });
    await upsertVerdict(db, { pageId: PID, revisionId: RID, gateVersion: GATE_VERSION, eligibility: "easy_win", reasons: [], evaluatedAt: new Date().toISOString() });
    await db
      .prepare("INSERT INTO stale_candidates (page_id, section_heading, sentence_text, year, marker, score, explanation, detector_version, source_revision_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .bind(PID, "Plans", "The base will open by 2024.", 2024, "will", 1.0, "e", "1.0.0", RID)
      .run();

    // Spy on the real queue's sendBatch to observe what scheduled() enqueues.
    const sendBatchSpy = vi.spyOn(testEnv.RESEARCH_QUEUE, "sendBatch");

    const controller = { scheduledTime: Date.now(), cron: "", noRetry: () => {} } as unknown as ScheduledController;
    await worker.scheduled(controller, workerEnv, ctx);

    expect(sendBatchSpy).toHaveBeenCalled();
    const enqueued = sendBatchSpy.mock.calls.flatMap((call) => call[0] as { body: ResearchMessage }[]);
    const keys = enqueued.map((m) => m.body.claimKey);
    const expectedKey = await computeClaimKey(PID, "Plans", "The base will open by 2024.", 2024);
    expect(keys).toContain(expectedKey);
    sendBatchSpy.mockRestore();
  });
});
