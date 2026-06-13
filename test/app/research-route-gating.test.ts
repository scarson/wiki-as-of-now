// ABOUTME: Pure gating for the research enqueue route — kill-switch → auth → eligibility (G11) → quota → enqueue.
// ABOUTME: Real D1 (freshTestExecutor); asserts each rejection branch + that G11 human_only survives the Phase 5 rewire.
import { describe, it, expect } from "vitest";
import { freshTestExecutor } from "../helpers/db";
import { upsertUser } from "../../src/db/users";
import { upsertArticle } from "../../src/db/articles";
import { upsertVerdict } from "../../src/db/eligibility-verdicts";
import { insertPackStatement } from "../../src/db/research-packs";
import { quotaEntryFor } from "../../src/quota/reconcile";
import { GATE_VERSION } from "../../src/safelane/eligibility";
import { gateResearchEnqueue } from "../../src/app/api/research/gate";
import type { ResearchMessage } from "../../src/queue/research-jobs";

function fakeQueue() {
  const sent: ResearchMessage[] = [];
  return { queue: { send: async (m: ResearchMessage) => { sent.push(m); } }, sent };
}

const CANDIDATE = {
  pageId: 4242,
  sourceRevisionId: 9001,
  sentenceText: "The fleet will reach full strength by 2025.",
  sectionHeading: "History",
  year: 2025,
};

async function seedAdmin(db: ReturnType<typeof freshTestExecutor>) {
  await upsertUser(db, {
    userId: "u_admin",
    identityProvider: "admin",
    identitySubject: "admin",
    email: "a@e.com",
    createdAt: "2026-06-13T00:00:00.000Z",
  });
}

// Seed one committed pack+ledger row for u_admin so the per-user cap is reachable.
async function seedOnePack(db: ReturnType<typeof freshTestExecutor>) {
  await upsertArticle(db, { pageId: 4242, title: "T", revisionId: 9001, fetchedAt: "2026-06-13T00:00:00.000Z" });
  const pack = {
    claimKey: "seed-claim",
    sourceRevisionId: 9001,
    pageId: 4242,
    sectionHeading: "History",
    sentenceText: "x",
    year: 2025,
    providerName: "stub",
    modelVersion: "fake-provider/0",
    status: "no_proposals" as const,
    queries: [],
    cards: [],
    dispositions: [],
    evaluatedAt: "2026-06-13T01:00:00.000Z",
  };
  await db.batch([insertPackStatement(db, pack), quotaEntryFor(db, { userId: "u_admin", pack, neurons: 0, braveQueryCount: 0 })]);
}

describe("research enqueue gating", () => {
  it("kill-switch ON → blocked with 'disabled', nothing enqueued", async () => {
    const db = freshTestExecutor();
    const { queue, sent } = fakeQueue();
    const result = await gateResearchEnqueue({
      env: { RESEARCH_KILL_SWITCH: "1" },
      db,
      authContext: { kind: "authenticated", userId: "u_admin" },
      candidate: CANDIDATE,
      now: "2026-06-13T12:00:00.000Z",
      queue,
      quotaConfig: { perUserDailyCap: 10, globalDailyCap: 50 },
    });
    expect(result.outcome).toBe("disabled");
    expect(sent).toHaveLength(0);
  });

  it("anonymous user → blocked with 'unauthenticated', nothing enqueued", async () => {
    const db = freshTestExecutor();
    const { queue, sent } = fakeQueue();
    const result = await gateResearchEnqueue({
      env: {},
      db,
      authContext: { kind: "anonymous" },
      candidate: CANDIDATE,
      now: "2026-06-13T12:00:00.000Z",
      queue,
      quotaConfig: { perUserDailyCap: 10, globalDailyCap: 50 },
    });
    expect(result.outcome).toBe("unauthenticated");
    expect(sent).toHaveLength(0);
  });

  it("authenticated but human_only candidate → 'ineligible' (G11), nothing enqueued — even past kill-switch + auth", async () => {
    const db = freshTestExecutor();
    await seedAdmin(db);
    await upsertArticle(db, { pageId: CANDIDATE.pageId, title: "T", revisionId: CANDIDATE.sourceRevisionId, fetchedAt: "2026-06-13T00:00:00.000Z" });
    // Record a human_only verdict for the candidate's (page, revision) — the safe-lane gate MUST refuse it.
    await upsertVerdict(db, { pageId: CANDIDATE.pageId, revisionId: CANDIDATE.sourceRevisionId, gateVersion: GATE_VERSION, eligibility: "human_only", reasons: ["blp_category"], evaluatedAt: "2026-06-13T00:00:00.000Z" });
    const { queue, sent } = fakeQueue();
    const result = await gateResearchEnqueue({
      env: {},
      db,
      authContext: { kind: "authenticated", userId: "u_admin" },
      candidate: CANDIDATE,
      now: "2026-06-13T12:00:00.000Z",
      queue,
      quotaConfig: { perUserDailyCap: 10, globalDailyCap: 50 },
    });
    expect(result.outcome).toBe("ineligible");
    expect(result.reasons).toEqual(["blp_category"]);
    expect(sent).toHaveLength(0);
  });

  it("authenticated + no verdict recorded → 'ineligible' (G11 fail-closed to human_only), nothing enqueued", async () => {
    const db = freshTestExecutor();
    await seedAdmin(db);
    const { queue, sent } = fakeQueue();
    const result = await gateResearchEnqueue({
      env: {},
      db,
      authContext: { kind: "authenticated", userId: "u_admin" },
      candidate: CANDIDATE,
      now: "2026-06-13T12:00:00.000Z",
      queue,
      quotaConfig: { perUserDailyCap: 10, globalDailyCap: 50 },
    });
    expect(result.outcome).toBe("ineligible");
    expect(result.reasons).toEqual(["no_verdict"]);
    expect(sent).toHaveLength(0);
  });

  it("authenticated + easy_win + under quota → enqueued exactly once", async () => {
    const db = freshTestExecutor();
    await seedAdmin(db);
    await upsertArticle(db, { pageId: CANDIDATE.pageId, title: "T", revisionId: CANDIDATE.sourceRevisionId, fetchedAt: "2026-06-13T00:00:00.000Z" });
    await upsertVerdict(db, { pageId: CANDIDATE.pageId, revisionId: CANDIDATE.sourceRevisionId, gateVersion: GATE_VERSION, eligibility: "easy_win", reasons: [], evaluatedAt: "2026-06-13T00:00:00.000Z" });
    const { queue, sent } = fakeQueue();
    const result = await gateResearchEnqueue({
      env: {},
      db,
      authContext: { kind: "authenticated", userId: "u_admin" },
      candidate: CANDIDATE,
      now: "2026-06-13T12:00:00.000Z",
      queue,
      quotaConfig: { perUserDailyCap: 10, globalDailyCap: 50 },
    });
    expect(result.outcome).toBe("enqueued");
    expect(sent).toHaveLength(1);
    expect(sent[0].claimKey).toMatch(/^[0-9a-f]{64}$/);
  });

  it("authenticated + easy_win but at the user cap → 'quota_exceeded', nothing enqueued", async () => {
    const db = freshTestExecutor();
    await seedAdmin(db);
    await seedOnePack(db); // seeds the article + one pack+ledger row for u_admin today
    await upsertVerdict(db, { pageId: CANDIDATE.pageId, revisionId: CANDIDATE.sourceRevisionId, gateVersion: GATE_VERSION, eligibility: "easy_win", reasons: [], evaluatedAt: "2026-06-13T00:00:00.000Z" });
    const { queue, sent } = fakeQueue();
    const result = await gateResearchEnqueue({
      env: {},
      db,
      authContext: { kind: "authenticated", userId: "u_admin" },
      candidate: CANDIDATE,
      now: "2026-06-13T12:00:00.000Z",
      queue,
      quotaConfig: { perUserDailyCap: 1, globalDailyCap: 50 },
    });
    expect(result.outcome).toBe("quota_exceeded");
    expect(sent).toHaveLength(0);
  });
});
