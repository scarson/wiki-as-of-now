// ABOUTME: Tests for the article + stale-candidate persistence module (src/db/articles.ts).
// ABOUTME: Covers upsert idempotency, candidate insert/read ordering, re-detect replacement, and FK ordering.
import { describe, it, expect } from "vitest";
import {
  upsertArticle,
  insertCandidates,
  getCandidatesByPageId,
} from "../../src/db/articles";
import { DETECTOR_VERSION } from "../../src/detector/detect";
import { freshTestExecutor } from "../helpers/db";
import type { StaleCandidate } from "../../src/domain/types";

function candidate(overrides: Partial<StaleCandidate> = {}): StaleCandidate {
  return {
    sentenceText: "The fleet will reach full strength.",
    sectionHeading: "History",
    year: 2017,
    marker: "will",
    score: { temporalRisk: 9, futureTenseConfidence: 1, suppression: 0, total: 10 },
    explanation: "Future-tense claim anchored to 2017.",
    sectionIndex: 1,
    sentenceIndex: 0,
    surroundingText: null,
    ...overrides,
  };
}

describe("upsertArticle", () => {
  it("inserts a new article", async () => {
    const exec = freshTestExecutor();
    await upsertArticle(exec, {
      pageId: 42,
      title: "Test Article",
      revisionId: 100,
      fetchedAt: "2026-06-05T00:00:00.000Z",
    });
    const rows = await exec
      .prepare("SELECT page_id, title, revision_id, fetched_at FROM articles")
      .all<{ page_id: number; title: string; revision_id: number; fetched_at: string }>();
    expect(rows).toEqual([
      { page_id: 42, title: "Test Article", revision_id: 100, fetched_at: "2026-06-05T00:00:00.000Z" },
    ]);
  });

  it("updates in place on conflict (idempotent on the natural key)", async () => {
    const exec = freshTestExecutor();
    await upsertArticle(exec, { pageId: 42, title: "Old", revisionId: 100, fetchedAt: "2026-06-05T00:00:00.000Z" });
    await upsertArticle(exec, { pageId: 42, title: "New", revisionId: 200, fetchedAt: "2026-06-06T00:00:00.000Z" });
    const rows = await exec
      .prepare("SELECT page_id, title, revision_id, fetched_at FROM articles")
      .all<{ page_id: number; title: string; revision_id: number; fetched_at: string }>();
    expect(rows).toEqual([
      { page_id: 42, title: "New", revision_id: 200, fetched_at: "2026-06-06T00:00:00.000Z" },
    ]);
  });
});

describe("insertCandidates / getCandidatesByPageId", () => {
  it("persists candidates and reads them back ordered by score desc", async () => {
    const exec = freshTestExecutor();
    await upsertArticle(exec, { pageId: 42, title: "T", revisionId: 100, fetchedAt: "2026-06-05T00:00:00.000Z" });
    await insertCandidates(exec, 42, 100, [
      candidate({ sentenceText: "low", score: { temporalRisk: 1, futureTenseConfidence: 1, suppression: 0, total: 3 } }),
      candidate({ sentenceText: "high", score: { temporalRisk: 9, futureTenseConfidence: 1, suppression: 0, total: 12 } }),
    ]);
    const rows = await getCandidatesByPageId(exec, 42);
    expect(rows.map(r => r.sentenceText)).toEqual(["high", "low"]);
    expect(rows[0]).toMatchObject({
      pageId: 42,
      sectionHeading: "History",
      year: 2017,
      marker: "will",
      score: 12,
      explanation: "Future-tense claim anchored to 2017.",
      detectorVersion: DETECTOR_VERSION,
      sourceRevisionId: 100,
    });
    expect(typeof rows[0].id).toBe("number");
  });

  it("round-trips surroundingText, including the null (claim-stands-alone) case", async () => {
    const exec = freshTestExecutor();
    await upsertArticle(exec, { pageId: 42, title: "T", revisionId: 100, fetchedAt: "2026-06-05T00:00:00.000Z" });
    await insertCandidates(exec, 42, 100, [
      candidate({ sentenceText: "with context", surroundingText: "Before. with context After." }),
      candidate({ sentenceText: "alone", surroundingText: null }),
    ]);
    const rows = await getCandidatesByPageId(exec, 42);
    const byText = new Map(rows.map(r => [r.sentenceText, r.surroundingText]));
    expect(byText.get("with context")).toBe("Before. with context After.");
    expect(byText.get("alone")).toBeNull();
  });

  it("replaces the prior set on re-detect (no duplicate/stale rows)", async () => {
    const exec = freshTestExecutor();
    await upsertArticle(exec, { pageId: 42, title: "T", revisionId: 100, fetchedAt: "2026-06-05T00:00:00.000Z" });
    await insertCandidates(exec, 42, 100, [candidate({ sentenceText: "first run" })]);
    await insertCandidates(exec, 42, 200, [candidate({ sentenceText: "second run" })]);
    const rows = await getCandidatesByPageId(exec, 42);
    expect(rows).toHaveLength(1);
    expect(rows[0].sentenceText).toBe("second run");
    expect(rows[0].sourceRevisionId).toBe(200);
  });

  it("only replaces candidates for the targeted page", async () => {
    const exec = freshTestExecutor();
    await upsertArticle(exec, { pageId: 1, title: "A", revisionId: 10, fetchedAt: "2026-06-05T00:00:00.000Z" });
    await upsertArticle(exec, { pageId: 2, title: "B", revisionId: 20, fetchedAt: "2026-06-05T00:00:00.000Z" });
    await insertCandidates(exec, 1, 10, [candidate({ sentenceText: "page one" })]);
    await insertCandidates(exec, 2, 20, [candidate({ sentenceText: "page two" })]);
    await insertCandidates(exec, 1, 11, [candidate({ sentenceText: "page one again" })]);
    expect((await getCandidatesByPageId(exec, 2)).map(r => r.sentenceText)).toEqual(["page two"]);
    expect((await getCandidatesByPageId(exec, 1)).map(r => r.sentenceText)).toEqual(["page one again"]);
  });

  it("persists nothing for an empty candidate set", async () => {
    const exec = freshTestExecutor();
    await upsertArticle(exec, { pageId: 42, title: "T", revisionId: 100, fetchedAt: "2026-06-05T00:00:00.000Z" });
    await insertCandidates(exec, 42, 100, []);
    expect(await getCandidatesByPageId(exec, 42)).toEqual([]);
  });

  it("returns [] for a page with no persisted candidates", async () => {
    const exec = freshTestExecutor();
    expect(await getCandidatesByPageId(exec, 9999)).toEqual([]);
  });

  it("rejects inserting candidates before the parent article exists (FK ordering)", async () => {
    const exec = freshTestExecutor();
    await expect(insertCandidates(exec, 42, 100, [candidate()])).rejects.toThrow(/FOREIGN KEY/i);
  });
});
