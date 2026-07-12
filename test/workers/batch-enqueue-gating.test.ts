// ABOUTME: Workers-pool SECURITY test — the batch enqueue path is gated identically to the single-candidate route.
// ABOUTME: Real Miniflare D1 + jose: anonymous→401, kill-switch→503, human_only/no-verdict NOT enqueued, over-quota NOT enqueued, mixed batch only eligible+in-budget.
import { describe, it, expect, vi } from "vitest";
import { testEnv } from "./test-env";
import { d1Executor } from "../../src/db/client";
import { upsertUser } from "../../src/db/users";
import { upsertArticle } from "../../src/db/articles";
import { upsertVerdict } from "../../src/db/eligibility-verdicts";
import { insertPackStatement } from "../../src/db/research-packs";
import { quotaEntryFor } from "../../src/quota/reconcile";
import { GATE_VERSION } from "../../src/safelane/eligibility";
import { gateEnqueueCandidatesForResearch } from "../../src/queue/enqueue-candidates";
import type { ResearchMessage } from "../../src/queue/research-jobs";

const NOW = "2026-06-13T12:00:00.000Z";

function fakeQueue() {
  const sent: ResearchMessage[] = [];
  return { sent, queue: { send: vi.fn(async (m: ResearchMessage) => { sent.push(m); }) } };
}

async function seedUser(db: ReturnType<typeof d1Executor>, userId: string) {
  await upsertUser(db, { userId, identityProvider: "google", identitySubject: userId, email: `${userId}@e.com`, createdAt: NOW });
}

/** Insert one stale candidate at (pageId, rev) with a verdict, return its surrogate id. */
async function seedCandidate(
  db: ReturnType<typeof d1Executor>,
  pageId: number,
  rev: number,
  eligibility: "easy_win" | "human_only" | "none",
): Promise<number> {
  await upsertArticle(db, { pageId, title: "T", revisionId: rev, fetchedAt: NOW });
  await db.prepare(
    "INSERT INTO stale_candidates (page_id, section_heading, sentence_text, year, marker, score, explanation, detector_version, source_revision_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
  ).bind(pageId, "Fleet", "The fleet will reach full strength by 2025.", 2025, "will", 1.5, "e", "1.0.0", rev).run();
  if (eligibility !== "none") {
    await upsertVerdict(db, { pageId, revisionId: rev, gateVersion: GATE_VERSION, eligibility, reasons: eligibility === "human_only" ? ["blp_category"] : [], evaluatedAt: NOW });
  }
  const rows = await db.prepare("SELECT id FROM stale_candidates WHERE page_id = ? AND source_revision_id = ?").bind(pageId, rev).all<{ id: number }>();
  return rows[rows.length - 1].id;
}

/** Commit a pack+ledger row for userId today so the per-user cap is reachable. */
async function seedPackForUser(db: ReturnType<typeof d1Executor>, userId: string, pageId: number, rev: number) {
  await upsertArticle(db, { pageId, title: "T", revisionId: rev, fetchedAt: NOW });
  const pack = {
    claimKey: `seed-${pageId}-${rev}`, sourceRevisionId: rev, pageId,
    sectionHeading: "History", sentenceText: "x", year: 2025,
    providerName: "stub", modelVersion: "fake-provider/0", status: "no_proposals" as const,
    queries: [], cards: [], dispositions: [], evaluatedAt: NOW,
  };
  await db.batch([insertPackStatement(db, pack), quotaEntryFor(db, { userId, pack, neurons: 0, braveQueryCount: 0 })]);
}

describe("batch enqueue gating (real Miniflare D1)", () => {
  it("anonymous → unauthenticated, NOTHING enqueued", async () => {
    const db = d1Executor(testEnv.DB);
    const id = await seedCandidate(db, 6001, 8001, "easy_win");
    const { queue, sent } = fakeQueue();
    const result = await gateEnqueueCandidatesForResearch({
      env: {}, db, authContext: { kind: "anonymous" }, candidateIds: [id], now: NOW, queue,
      quotaConfig: { perUserDailyCap: 10, globalDailyCap: 50 },
    });
    expect(result.outcome).toBe("unauthenticated");
    expect(sent).toHaveLength(0);
  });

  it("kill-switch ON → disabled, NOTHING enqueued", async () => {
    const db = d1Executor(testEnv.DB);
    const id = await seedCandidate(db, 6002, 8002, "easy_win");
    await seedUser(db, "u_a");
    const { queue, sent } = fakeQueue();
    const result = await gateEnqueueCandidatesForResearch({
      env: { RESEARCH_KILL_SWITCH: "1" }, db, authContext: { kind: "authenticated", userId: "u_a" }, candidateIds: [id], now: NOW, queue,
      quotaConfig: { perUserDailyCap: 10, globalDailyCap: 50 },
    });
    expect(result.outcome).toBe("disabled");
    expect(sent).toHaveLength(0);
  });

  it("a human_only candidate is NOT enqueued (G11), reported skipped_ineligible", async () => {
    const db = d1Executor(testEnv.DB);
    await seedUser(db, "u_b");
    const id = await seedCandidate(db, 6003, 8003, "human_only");
    const { queue, sent } = fakeQueue();
    const result = await gateEnqueueCandidatesForResearch({
      env: {}, db, authContext: { kind: "authenticated", userId: "u_b" }, candidateIds: [id], now: NOW, queue,
      quotaConfig: { perUserDailyCap: 10, globalDailyCap: 50 },
    });
    expect(result.outcome).toBe("processed");
    if (result.outcome !== "processed") throw new Error("expected processed");
    expect(result.results).toEqual([{ candidateId: id, outcome: "skipped_ineligible", reasons: ["blp_category"] }]);
    expect(sent).toHaveLength(0);
  });

  it("a no-verdict candidate fails closed to human_only — NOT enqueued (G11)", async () => {
    const db = d1Executor(testEnv.DB);
    await seedUser(db, "u_c");
    const id = await seedCandidate(db, 6004, 8004, "none");
    const { queue, sent } = fakeQueue();
    const result = await gateEnqueueCandidatesForResearch({
      env: {}, db, authContext: { kind: "authenticated", userId: "u_c" }, candidateIds: [id], now: NOW, queue,
      quotaConfig: { perUserDailyCap: 10, globalDailyCap: 50 },
    });
    expect(result.outcome).toBe("processed");
    if (result.outcome !== "processed") throw new Error("expected processed");
    expect(result.results).toEqual([{ candidateId: id, outcome: "skipped_ineligible", reasons: ["no_verdict"] }]);
    expect(sent).toHaveLength(0);
  });

  it("over-quota easy_win candidate is NOT enqueued, reported skipped_quota", async () => {
    const db = d1Executor(testEnv.DB);
    await seedUser(db, "u_d");
    await seedPackForUser(db, "u_d", 6005, 8005); // 1 committed pack today
    const id = await seedCandidate(db, 6006, 8006, "easy_win");
    const { queue, sent } = fakeQueue();
    const result = await gateEnqueueCandidatesForResearch({
      env: {}, db, authContext: { kind: "authenticated", userId: "u_d" }, candidateIds: [id], now: NOW, queue,
      quotaConfig: { perUserDailyCap: 1, globalDailyCap: 50 }, // cap already reached by the seeded pack
    });
    expect(result.outcome).toBe("processed");
    if (result.outcome !== "processed") throw new Error("expected processed");
    expect(result.results).toEqual([{ candidateId: id, outcome: "skipped_quota" }]);
    expect(sent).toHaveLength(0);
  });

  it("unknown candidate id reported not_found, nothing enqueued for it", async () => {
    const db = d1Executor(testEnv.DB);
    await seedUser(db, "u_e");
    const { queue, sent } = fakeQueue();
    const result = await gateEnqueueCandidatesForResearch({
      env: {}, db, authContext: { kind: "authenticated", userId: "u_e" }, candidateIds: [999777], now: NOW, queue,
      quotaConfig: { perUserDailyCap: 10, globalDailyCap: 50 },
    });
    expect(result.outcome).toBe("processed");
    if (result.outcome !== "processed") throw new Error("expected processed");
    expect(result.results).toEqual([{ candidateId: 999777, outcome: "not_found" }]);
    expect(sent).toHaveLength(0);
  });

  it("mixed batch: only the eligible + in-budget id is enqueued, carrying the enqueuer's userId", async () => {
    const db = d1Executor(testEnv.DB);
    await seedUser(db, "u_mix");
    const easyA = await seedCandidate(db, 6101, 8101, "easy_win"); // eligible
    const human = await seedCandidate(db, 6102, 8102, "human_only"); // ineligible
    const noVerdict = await seedCandidate(db, 6103, 8103, "none"); // ineligible (fail closed)
    const { queue, sent } = fakeQueue();
    const result = await gateEnqueueCandidatesForResearch({
      env: {}, db, authContext: { kind: "authenticated", userId: "u_mix" },
      candidateIds: [easyA, human, noVerdict, 555111], now: NOW, queue,
      quotaConfig: { perUserDailyCap: 10, globalDailyCap: 50 },
    });
    expect(result.outcome).toBe("processed");
    if (result.outcome !== "processed") throw new Error("expected processed");
    expect(result.results).toEqual([
      { candidateId: easyA, outcome: "enqueued" },
      { candidateId: human, outcome: "skipped_ineligible", reasons: ["blp_category"] },
      { candidateId: noVerdict, outcome: "skipped_ineligible", reasons: ["no_verdict"] },
      { candidateId: 555111, outcome: "not_found" },
    ]);
    expect(sent).toHaveLength(1);
    expect(sent[0].claimKey).toMatch(/^[0-9a-f]{64}$/);
    expect(sent[0].userId).toBe("u_mix"); // Fix 2: the message carries the enqueuer's real userId
  });

  it("global cap also blocks an otherwise-eligible candidate", async () => {
    const db = d1Executor(testEnv.DB);
    await seedUser(db, "u_g");
    await seedPackForUser(db, "u_g", 6201, 8201); // 1 committed pack today (global = 1)
    const id = await seedCandidate(db, 6202, 8202, "easy_win");
    const { queue, sent } = fakeQueue();
    const result = await gateEnqueueCandidatesForResearch({
      env: {}, db, authContext: { kind: "authenticated", userId: "u_g" }, candidateIds: [id], now: NOW, queue,
      quotaConfig: { perUserDailyCap: 10, globalDailyCap: 1 }, // global cap already hit
    });
    expect(result.outcome).toBe("processed");
    if (result.outcome !== "processed") throw new Error("expected processed");
    expect(result.results).toEqual([{ candidateId: id, outcome: "skipped_quota" }]);
    expect(sent).toHaveLength(0);
  });
});
