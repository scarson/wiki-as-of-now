// ABOUTME: Workers-pool proof of the producer→queue→consumer seam — a candidate enqueued by the queue page's
// ABOUTME: producer (enqueueCandidatesForResearch) round-trips through the REAL Miniflare queue into a consumer pack.
import { describe, it, expect, vi } from "vitest";
import worker from "../../workers/research/index";
import { testEnv } from "./test-env";
import { d1Executor } from "../../src/db/client";
import { upsertArticle, getCandidatesByPageId } from "../../src/db/articles";
import { enqueueCandidatesForResearch } from "../../src/queue/enqueue-candidates";
import { computeClaimKey, getPack } from "../../src/db/research-packs";
import type { ResearchMessage } from "../../src/queue/research-jobs";

const workerEnv = { DB: testEnv.DB, RESEARCH_QUEUE: testEnv.RESEARCH_QUEUE, AI: testEnv.AI };
const ctx = { waitUntil: () => {}, passThroughOnException: () => {} } as unknown as ExecutionContext;

describe("queue-page enqueue → real Miniflare queue → consumer pack", () => {
  it("a captured candidate enqueued by the page is consumed into a stub pack on real D1", async () => {
    const db = d1Executor(testEnv.DB);
    await upsertArticle(db, {
      pageId: 555,
      title: "Megaproject X",
      revisionId: 70,
      fetchedAt: new Date().toISOString(),
    });
    // Persist one stale candidate at the live revision via the real schema, then capture its surrogate id.
    const SECTION = "Status";
    const SENTENCE = "The bridge will open by 2024.";
    const YEAR = 2024;
    await db
      .prepare(
        "INSERT INTO stale_candidates (page_id, section_heading, sentence_text, year, marker, score, explanation, detector_version, source_revision_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
      )
      .bind(555, SECTION, SENTENCE, YEAR, "will", 1.5, "Forward claim anchored to 2024.", "1.0.0", 70)
      .run();
    const cid = (await getCandidatesByPageId(db, 555))[0].id;

    // Collect what enqueueResearch sends into the REAL queue (mirrors the route's void adapter).
    const collected: ResearchMessage[] = [];
    const queue = {
      send: async (m: ResearchMessage) => {
        collected.push(m);
        await testEnv.RESEARCH_QUEUE.send(m);
      },
    };
    const result = await enqueueCandidatesForResearch(db, queue, [cid]);
    expect(result.accepted).toEqual([cid]);
    expect(result.skipped).toEqual([]);
    expect(collected[0].claimKey).toMatch(/^[0-9a-f]{64}$/);

    // Drive the consumer with the exact enqueued message.
    const message = {
      id: "m1",
      timestamp: new Date(),
      body: collected[0],
      attempts: 1,
      ack: vi.fn(),
      retry: vi.fn(),
    };
    const batch = { queue: "research", messages: [message], ackAll: vi.fn(), retryAll: vi.fn() };
    await worker.queue(batch as unknown as MessageBatch<ResearchMessage>, workerEnv, ctx);

    expect(message.ack).toHaveBeenCalledTimes(1);
    expect(message.retry).not.toHaveBeenCalled();

    const claimKey = await computeClaimKey(555, SECTION, SENTENCE, YEAR);
    const read = await getPack(db, claimKey, 70);
    expect(read.state).toBe("found");
    if (read.state === "found") {
      expect(read.pack.modelVersion).toBe("fake-provider/0"); // stub until the real provider is enabled (CC-7)
    }
  });
});
