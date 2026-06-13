// ABOUTME: Node-pool tests for the queue producer core + seed-list refresh logic (real D1, injected fetch stubs).
// ABOUTME: Routes call getCloudflareContext (workers-only), so the load-bearing logic is tested via extracted functions.
import { describe, it, expect, vi } from "vitest";
import { freshTestExecutor } from "../helpers/db";
import { upsertArticle, getCandidatesByPageId } from "../../src/db/articles";
import { enqueueCandidatesForResearch } from "../../src/queue/enqueue-candidates";
import { getOrRefreshSeedList } from "../../src/ingest/seed-topics";
import { upsertSeedList } from "../../src/db/seed-lists";

async function insertCandidate(
  db: ReturnType<typeof freshTestExecutor>,
  pageId: number,
  revisionId: number
): Promise<number> {
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
  return (await getCandidatesByPageId(db, pageId))[0].id;
}

describe("enqueueCandidatesForResearch", () => {
  it("enqueues one research message per known candidate, sequentially", async () => {
    const db = freshTestExecutor();
    await upsertArticle(db, { pageId: 7, title: "T", revisionId: 11, fetchedAt: new Date().toISOString() });
    const cid = await insertCandidate(db, 7, 11);

    const sent: unknown[] = [];
    const queue = { send: vi.fn(async (m: unknown) => { sent.push(m); }) };
    const result = await enqueueCandidatesForResearch(db, queue, [cid]);
    expect(result.accepted).toEqual([cid]);
    expect(result.skipped).toEqual([]);
    expect(queue.send).toHaveBeenCalledTimes(1);
    // the producer computed claimKey internally — caller never set it
    expect((sent[0] as { claimKey: string }).claimKey).toMatch(/^[0-9a-f]{64}$/);
  });

  it("skips unknown candidate ids (no throw, reported in skipped)", async () => {
    const db = freshTestExecutor();
    const queue = { send: vi.fn() };
    const result = await enqueueCandidatesForResearch(db, queue, [99999]);
    expect(result.accepted).toEqual([]);
    expect(result.skipped).toEqual([99999]);
    expect(queue.send).not.toHaveBeenCalled();
  });

  it("empty id list is a no-op success", async () => {
    const db = freshTestExecutor();
    const queue = { send: vi.fn() };
    const result = await enqueueCandidatesForResearch(db, queue, []);
    expect(result).toEqual({ accepted: [], skipped: [] });
    expect(queue.send).not.toHaveBeenCalled();
  });

  it("partitions a mix of known and unknown ids into accepted/skipped in order", async () => {
    const db = freshTestExecutor();
    await upsertArticle(db, { pageId: 8, title: "T8", revisionId: 12, fetchedAt: new Date().toISOString() });
    const cid = await insertCandidate(db, 8, 12);
    const queue = { send: vi.fn(async () => {}) };
    const result = await enqueueCandidatesForResearch(db, queue, [99999, cid]);
    expect(result.accepted).toEqual([cid]);
    expect(result.skipped).toEqual([99999]);
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
