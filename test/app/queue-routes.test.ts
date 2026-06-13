// ABOUTME: Node-pool tests for the queue producer core + seed-list refresh logic (real D1, injected fetch stubs).
// ABOUTME: Routes call getCloudflareContext (workers-only), so the load-bearing logic is tested via extracted functions.
import { describe, it, expect, vi } from "vitest";
import { freshTestExecutor } from "../helpers/db";
import { upsertArticle, getCandidatesByPageId } from "../../src/db/articles";
import { upsertUser } from "../../src/db/users";
import { upsertVerdict } from "../../src/db/eligibility-verdicts";
import { GATE_VERSION } from "../../src/safelane/eligibility";
import { gateEnqueueCandidatesForResearch } from "../../src/queue/enqueue-candidates";
import { getOrRefreshSeedList } from "../../src/ingest/seed-topics";
import { upsertSeedList } from "../../src/db/seed-lists";
import type { AuthContext } from "../../src/app/api/research/gate";

const NOW = "2026-06-13T12:00:00.000Z";
const QUOTA = { perUserDailyCap: 10, globalDailyCap: 50 };
const USER: AuthContext = { kind: "authenticated", userId: "u_q" };

async function seedUser(db: ReturnType<typeof freshTestExecutor>) {
  await upsertUser(db, { userId: "u_q", identityProvider: "google", identitySubject: "q", email: "q@e.com", createdAt: NOW });
}

async function insertCandidate(
  db: ReturnType<typeof freshTestExecutor>,
  pageId: number,
  revisionId: number,
  eligibility: "easy_win" | "human_only" = "easy_win",
): Promise<number> {
  await upsertArticle(db, { pageId, title: "T", revisionId, fetchedAt: NOW });
  await db
    .prepare(
      "INSERT INTO stale_candidates (page_id, section_heading, sentence_text, year, marker, score, explanation, detector_version, source_revision_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
    )
    .bind(
      pageId,
      "Fleet",
      "The fleet will reach full strength by 2025.",
      2025,
      "will",
      1.5,
      "Forward claim anchored to 2025.",
      "1.0.0",
      revisionId
    )
    .run();
  await upsertVerdict(db, { pageId, revisionId, gateVersion: GATE_VERSION, eligibility, reasons: eligibility === "human_only" ? ["blp_category"] : [], evaluatedAt: NOW });
  return (await getCandidatesByPageId(db, pageId))[0].id;
}

describe("gateEnqueueCandidatesForResearch", () => {
  it("enqueues one research message per eligible candidate, sequentially, carrying the enqueuer's userId", async () => {
    const db = freshTestExecutor();
    await seedUser(db);
    const cid = await insertCandidate(db, 7, 11);

    const sent: { claimKey: string; userId?: string }[] = [];
    const queue = { send: vi.fn(async (m: { claimKey: string; userId?: string }) => { sent.push(m); }) };
    const result = await gateEnqueueCandidatesForResearch({ env: {}, db, authContext: USER, candidateIds: [cid], now: NOW, queue, quotaConfig: QUOTA });
    expect(result.outcome).toBe("processed");
    if (result.outcome === "processed") expect(result.results).toEqual([{ candidateId: cid, outcome: "enqueued" }]);
    expect(queue.send).toHaveBeenCalledTimes(1);
    // the producer computed claimKey internally — caller never set it
    expect(sent[0].claimKey).toMatch(/^[0-9a-f]{64}$/);
    expect(sent[0].userId).toBe("u_q");
  });

  it("reports unknown candidate ids as not_found (no throw, nothing enqueued)", async () => {
    const db = freshTestExecutor();
    await seedUser(db);
    const queue = { send: vi.fn() };
    const result = await gateEnqueueCandidatesForResearch({ env: {}, db, authContext: USER, candidateIds: [99999], now: NOW, queue, quotaConfig: QUOTA });
    expect(result.outcome).toBe("processed");
    if (result.outcome === "processed") expect(result.results).toEqual([{ candidateId: 99999, outcome: "not_found" }]);
    expect(queue.send).not.toHaveBeenCalled();
  });

  it("empty id list is a no-op processed success", async () => {
    const db = freshTestExecutor();
    await seedUser(db);
    const queue = { send: vi.fn() };
    const result = await gateEnqueueCandidatesForResearch({ env: {}, db, authContext: USER, candidateIds: [], now: NOW, queue, quotaConfig: QUOTA });
    expect(result).toEqual({ outcome: "processed", results: [] });
    expect(queue.send).not.toHaveBeenCalled();
  });

  it("partitions a mix of known-eligible and unknown ids in order; only the eligible one enqueues", async () => {
    const db = freshTestExecutor();
    await seedUser(db);
    const cid = await insertCandidate(db, 8, 12);
    const queue = { send: vi.fn(async () => {}) };
    const result = await gateEnqueueCandidatesForResearch({ env: {}, db, authContext: USER, candidateIds: [99999, cid], now: NOW, queue, quotaConfig: QUOTA });
    expect(result.outcome).toBe("processed");
    if (result.outcome === "processed") {
      expect(result.results).toEqual([
        { candidateId: 99999, outcome: "not_found" },
        { candidateId: cid, outcome: "enqueued" },
      ]);
    }
    expect(queue.send).toHaveBeenCalledTimes(1);
  });
});

describe("getOrRefreshSeedList", () => {
  it("serves a fresh stored list without refetching", async () => {
    const db = freshTestExecutor();
    await upsertSeedList(db, {
      topic: "military-procurement",
      title: "Military procurement",
      refreshedAt: "2026-06-13T00:00:00Z",
      windowStart: "2026-05-13",
      windowEnd: "2026-06-11",
      entryCount: 0,
    });
    let refetched = false;
    const read = await getOrRefreshSeedList(db, "military-procurement", {
      now: new Date("2026-06-14T00:00:00Z"), // 1 day old < 7-day cadence
      fetchCategoryMembers: async () => {
        refetched = true;
        return [];
      },
      fetchPageviewCount: async () => 0,
    });
    expect(read.state).toBe("found");
    expect(refetched).toBe(false);
  });

  it("recomputes a stale (>7-day) list", async () => {
    const db = freshTestExecutor();
    await upsertSeedList(db, {
      topic: "military-procurement",
      title: "Military procurement",
      refreshedAt: "2026-06-01T00:00:00Z",
      windowStart: "2026-05-01",
      windowEnd: "2026-05-30",
      entryCount: 0,
    });
    let refetched = false;
    await getOrRefreshSeedList(db, "military-procurement", {
      now: new Date("2026-06-13T00:00:00Z"), // 12 days old > 7
      fetchCategoryMembers: async () => {
        refetched = true;
        return [{ pageId: 1, title: "Alpha" }];
      },
      fetchPageviewCount: async () => 5000,
    });
    expect(refetched).toBe(true);
  });

  it("builds a never-computed known topic on first request", async () => {
    const db = freshTestExecutor();
    let refetched = false;
    const read = await getOrRefreshSeedList(db, "infrastructure-megaprojects", {
      now: new Date("2026-06-13T00:00:00Z"),
      fetchCategoryMembers: async () => {
        refetched = true;
        return [{ pageId: 9, title: "Bridge" }];
      },
      fetchPageviewCount: async () => 100,
    });
    expect(refetched).toBe(true);
    expect(read.state).toBe("found");
    if (read.state === "found") expect(read.entries[0].articleTitle).toBe("Bridge");
  });

  it("unknown topic returns not_found", async () => {
    const db = freshTestExecutor();
    const read = await getOrRefreshSeedList(db, "bogus", {
      now: new Date(),
      fetchCategoryMembers: async () => [],
      fetchPageviewCount: async () => 0,
    });
    expect(read.state).toBe("not_found");
  });
});
