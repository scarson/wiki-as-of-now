// ABOUTME: Workers-pool test for handleResearchEnqueue — the enqueue path against real Miniflare D1 + a spied queue.
// ABOUTME: Asserts the G11 safe-lane gate (human_only refused, easy_win enqueued) and that the caller never constructs claimKey.
import { describe, it, expect, vi } from "vitest";
import { testEnv } from "./test-env";
import { d1Executor } from "../../src/db/client";
import { upsertArticle } from "../../src/db/articles";
import { handleResearchEnqueue } from "../../src/app/api/research/[candidateId]/route";
import type { ResearchMessage } from "../../src/queue/research-jobs";
import type { EligibilityDecision } from "../../src/domain/types";

async function seed(db: ReturnType<typeof d1Executor>, pageId: number, rev: number) {
  await upsertArticle(db, { pageId, title: "T", revisionId: rev, fetchedAt: new Date().toISOString() });
  await db.prepare(
    "INSERT INTO stale_candidates (page_id, section_heading, sentence_text, year, marker, score, explanation, detector_version, source_revision_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
  ).bind(pageId, "Fleet", "The fleet will reach full strength by 2025.", 2025, "will", 1.5, "e", "1.0.0", rev).run();
  const rows = await db.prepare("SELECT id FROM stale_candidates WHERE page_id = ?").bind(pageId).all<{ id: number }>();
  return rows[0].id;
}
const fakeQueue = () => { const sent: ResearchMessage[] = []; return { sent, send: vi.fn(async (m: ResearchMessage) => { sent.push(m); }) }; };
const easyWin: EligibilityDecision = { eligibility: "easy_win", reasons: [] };
const humanOnly: EligibilityDecision = { eligibility: "human_only", reasons: ["blp_category"] };

describe("handleResearchEnqueue (real Miniflare D1)", () => {
  it("enqueues an easy_win candidate; caller never constructs claimKey; message carries pageId/rev/input", async () => {
    const db = d1Executor(testEnv.DB);
    const id = await seed(db, 5101, 7001);
    const q = fakeQueue();
    const res = await handleResearchEnqueue(db, q, id, async () => easyWin);
    expect(res.status).toBe(202);
    expect(q.send).toHaveBeenCalledTimes(1);
    expect(q.sent[0]).toMatchObject({
      pageId: 5101, sourceRevisionId: 7001,
      input: { claimText: "The fleet will reach full strength by 2025.", sectionHeading: "Fleet", year: 2025, sourceRevisionId: 7001 },
    });
    // enqueueResearch computed a 64-hex claimKey internally — the handler did not supply it.
    expect(q.sent[0].claimKey).toMatch(/^[0-9a-f]{64}$/);
  });

  it("refuses a human_only candidate with 403 and enqueues NOTHING (safe-lane guardrail G11)", async () => {
    const db = d1Executor(testEnv.DB);
    const id = await seed(db, 5102, 7002);
    const q = fakeQueue();
    const res = await handleResearchEnqueue(db, q, id, async () => humanOnly);
    expect(res.status).toBe(403);
    expect(q.send).not.toHaveBeenCalled();
  });

  it("returns 404 for an unknown candidate id and enqueues nothing", async () => {
    const db = d1Executor(testEnv.DB);
    const q = fakeQueue();
    const res = await handleResearchEnqueue(db, q, 888888, async () => easyWin);
    expect(res.status).toBe(404);
    expect(q.send).not.toHaveBeenCalled();
  });

  it("returns 400 for a non-positive-integer candidate id", async () => {
    const db = d1Executor(testEnv.DB);
    const q = fakeQueue();
    const res = await handleResearchEnqueue(db, q, Number.NaN, async () => easyWin);
    expect(res.status).toBe(400);
    expect(q.send).not.toHaveBeenCalled();
  });
});
