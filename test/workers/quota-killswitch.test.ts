// ABOUTME: Workers-pool test — kill-switch blocks the consumer; quota ledger commits atomically with the pack on real D1.
// ABOUTME: Asserts the ledger row lands once per committed pack, and that an ON-kill-switch batch persists nothing and retries.
import { describe, it, expect, vi } from "vitest";
import worker from "../../workers/research/index";
import { testEnv } from "./test-env";
import { d1Executor } from "../../src/db/client";
import { upsertArticle } from "../../src/db/articles";
import { computeClaimKey, getPack } from "../../src/db/research-packs";
import type { ResearchMessage } from "../../src/queue/research-jobs";

const PAGE_ID = 5252;
const REV_ID = 7007;
const SECTION = "Plans";
const SENTENCE = "The base will open by 2024.";
const YEAR = 2024;

const workerEnv = { DB: testEnv.DB, RESEARCH_QUEUE: testEnv.RESEARCH_QUEUE, AI: testEnv.AI };

function makeBatch(body: ResearchMessage) {
  const message = { id: "m1", timestamp: new Date(), body, attempts: 1, ack: vi.fn(), retry: vi.fn() };
  const batch = { queue: "research", messages: [message], ackAll: vi.fn(), retryAll: vi.fn() };
  return { batch, message };
}
const ctx = { waitUntil: () => {}, passThroughOnException: () => {} } as unknown as ExecutionContext;

describe("consumer — quota ledger + kill-switch on real Miniflare D1", () => {
  it("a committed pack also writes exactly one quota_ledger row, atomically (admin user self-seeded)", async () => {
    const db = d1Executor(testEnv.DB);
    await upsertArticle(db, { pageId: PAGE_ID, title: "T", revisionId: REV_ID, fetchedAt: "2026-06-13T00:00:00.000Z" });
    const claimKey = await computeClaimKey(PAGE_ID, SECTION, SENTENCE, YEAR);
    const body: ResearchMessage = { claimKey, pageId: PAGE_ID, sourceRevisionId: REV_ID, input: { claimText: SENTENCE, sectionHeading: SECTION, year: YEAR, sourceRevisionId: REV_ID } };
    const { batch, message } = makeBatch(body);

    await worker.queue(batch as unknown as MessageBatch<ResearchMessage>, workerEnv, ctx);

    expect(message.ack).toHaveBeenCalledTimes(1);
    expect(message.retry).not.toHaveBeenCalled();
    const read = await getPack(db, claimKey, REV_ID);
    expect(read.state).toBe("found");
    const ledger = await db.prepare("SELECT COUNT(*) AS n FROM quota_ledger WHERE claim_key = ?").bind(claimKey).all<{ n: number }>();
    expect(ledger[0].n).toBe(1);
    // The ledger row is keyed to the single-admin user (the actor for consumer/cron packs).
    const owner = await db.prepare("SELECT user_id FROM quota_ledger WHERE claim_key = ?").bind(claimKey).all<{ user_id: string }>();
    expect(owner[0].user_id).toBe("u_admin");
    // The stub provider surfaces no usage, so neurons/brave default to 0 — honest, not fabricated.
    const stats = await db.prepare("SELECT neurons, brave_query_count FROM quota_ledger WHERE claim_key = ?").bind(claimKey).all<{ neurons: number; brave_query_count: number }>();
    expect(stats[0]).toEqual({ neurons: 0, brave_query_count: 0 });
  });

  it("kill-switch ON: the consumer does NOT process — no pack, no ledger row, message retried", async () => {
    const db = d1Executor(testEnv.DB);
    await upsertArticle(db, { pageId: PAGE_ID + 1, title: "T2", revisionId: REV_ID, fetchedAt: "2026-06-13T00:00:00.000Z" });
    const claimKey = await computeClaimKey(PAGE_ID + 1, SECTION, SENTENCE, YEAR);
    const body: ResearchMessage = { claimKey, pageId: PAGE_ID + 1, sourceRevisionId: REV_ID, input: { claimText: SENTENCE, sectionHeading: SECTION, year: YEAR, sourceRevisionId: REV_ID } };
    const { batch, message } = makeBatch(body);

    await worker.queue(batch as unknown as MessageBatch<ResearchMessage>, { ...workerEnv, RESEARCH_KILL_SWITCH: "1" }, ctx);

    // Paused, not dropped: the message is retried so it resumes when the switch is turned off.
    expect(message.retry).toHaveBeenCalledTimes(1);
    expect(message.ack).not.toHaveBeenCalled();
    const read = await getPack(db, claimKey, REV_ID);
    expect(read.state).toBe("not_found");
    const ledger = await db.prepare("SELECT COUNT(*) AS n FROM quota_ledger WHERE claim_key = ?").bind(claimKey).all<{ n: number }>();
    expect(ledger[0].n).toBe(0);
  });
});
