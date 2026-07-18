// ABOUTME: Tests for the eligibility_verdicts persistence module (src/db/eligibility-verdicts.ts).
// ABOUTME: Covers upsert idempotency, targeted delete, FK enforcement, and the Stage-1 easy-win pre-filter query.
import { describe, it, expect } from "vitest";
import {
  upsertVerdict,
  deleteVerdict,
  selectEasyWinPageIds,
} from "../../src/db/eligibility-verdicts";
import { upsertArticle, insertCandidates } from "../../src/db/articles";
import { freshTestExecutor } from "../helpers/db";
import type { StaleCandidate } from "../../src/domain/types";
import type { VerdictRecord } from "../../src/db/eligibility-verdicts";

function article(pageId: number, revisionId: number = 100) {
  return {
    pageId,
    title: `Article ${pageId}`,
    revisionId,
    fetchedAt: "2026-06-06T00:00:00.000Z",
  };
}

function verdict(overrides: Partial<VerdictRecord> = {}): VerdictRecord {
  return {
    pageId: 1,
    revisionId: 100,
    gateVersion: "v1",
    eligibility: "easy_win",
    reasons: [],
    evaluatedAt: "2026-06-06T00:00:00.000Z",
    ...overrides,
  };
}

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

describe("upsertVerdict", () => {
  it("inserts a new verdict row", async () => {
    const exec = freshTestExecutor();
    await upsertArticle(exec, article(1));
    await upsertVerdict(exec, verdict());
    const rows = await exec
      .prepare("SELECT page_id, revision_id, gate_version, eligibility, reasons_json, evaluated_at FROM eligibility_verdicts")
      .all<{ page_id: number; revision_id: number; gate_version: string; eligibility: string; reasons_json: string; evaluated_at: string }>();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual({
      page_id: 1,
      revision_id: 100,
      gate_version: "v1",
      eligibility: "easy_win",
      reasons_json: "[]",
      evaluated_at: "2026-06-06T00:00:00.000Z",
    });
  });

  it("updates in place on conflict — same (page_id, revision_id, gate_version) produces no duplicate row", async () => {
    const exec = freshTestExecutor();
    await upsertArticle(exec, article(1));
    await upsertVerdict(exec, verdict({ eligibility: "easy_win", reasons: ["R1"], evaluatedAt: "2026-06-06T00:00:00.000Z" }));
    await upsertVerdict(exec, verdict({ eligibility: "human_only", reasons: ["R2", "R3"], evaluatedAt: "2026-06-07T00:00:00.000Z" }));
    const rows = await exec
      .prepare("SELECT eligibility, reasons_json, evaluated_at FROM eligibility_verdicts WHERE page_id = 1 AND revision_id = 100 AND gate_version = 'v1'")
      .all<{ eligibility: string; reasons_json: string; evaluated_at: string }>();
    expect(rows).toHaveLength(1);
    expect(rows[0].eligibility).toBe("human_only");
    expect(rows[0].reasons_json).toBe('["R2","R3"]');
    expect(rows[0].evaluated_at).toBe("2026-06-07T00:00:00.000Z");
  });

  it("rejects upsert when the page_id has no articles row (FK enforcement)", async () => {
    const exec = freshTestExecutor();
    await expect(upsertVerdict(exec, verdict({ pageId: 9999 }))).rejects.toThrow(/FOREIGN KEY/i);
  });
});

describe("deleteVerdict", () => {
  it("removes exactly the targeted (page_id, revision_id, gate_version) row", async () => {
    const exec = freshTestExecutor();
    await upsertArticle(exec, article(1));
    // Insert two verdicts: one to delete, one to keep (different gate_version).
    await upsertVerdict(exec, verdict({ gateVersion: "v1" }));
    await upsertVerdict(exec, verdict({ gateVersion: "v2" }));
    await deleteVerdict(exec, 1, 100, "v1");
    const rows = await exec
      .prepare("SELECT gate_version FROM eligibility_verdicts WHERE page_id = 1 AND revision_id = 100")
      .all<{ gate_version: string }>();
    expect(rows).toHaveLength(1);
    expect(rows[0].gate_version).toBe("v2");
  });

  it("is a no-op when the targeted row does not exist (no throw)", async () => {
    const exec = freshTestExecutor();
    await expect(deleteVerdict(exec, 9999, 1, "v1")).resolves.toBeUndefined();
  });
});

describe("selectEasyWinPageIds", () => {
  it("returns ascending page_ids for pages with an easy_win verdict at the current revision + given gate_version AND ≥1 candidate", async () => {
    const exec = freshTestExecutor();
    // Page 10: easy_win at revision 100, gate v1, has candidates → INCLUDED.
    await upsertArticle(exec, article(10, 100));
    await upsertVerdict(exec, verdict({ pageId: 10, revisionId: 100, gateVersion: "v1", eligibility: "easy_win" }));
    await insertCandidates(exec, 10, 100, [candidate()]);

    // Page 20: easy_win at revision 200, gate v1, has candidates → INCLUDED.
    await upsertArticle(exec, article(20, 200));
    await upsertVerdict(exec, verdict({ pageId: 20, revisionId: 200, gateVersion: "v1", eligibility: "easy_win" }));
    await insertCandidates(exec, 20, 200, [candidate()]);

    const result = await selectEasyWinPageIds(exec, "v1");
    expect(result).toEqual([10, 20]);
  });

  it("excludes a page whose verdict is human_only", async () => {
    const exec = freshTestExecutor();
    await upsertArticle(exec, article(1));
    await upsertVerdict(exec, verdict({ pageId: 1, revisionId: 100, gateVersion: "v1", eligibility: "human_only" }));
    await insertCandidates(exec, 1, 100, [candidate()]);
    const result = await selectEasyWinPageIds(exec, "v1");
    expect(result).toEqual([]);
  });

  it("excludes a page whose verdict revision_id differs from the article's current revision_id", async () => {
    const exec = freshTestExecutor();
    // Article is now at revision 200, but the verdict was recorded for revision 100.
    await upsertArticle(exec, article(1, 200));
    await upsertVerdict(exec, verdict({ pageId: 1, revisionId: 100, gateVersion: "v1", eligibility: "easy_win" }));
    await insertCandidates(exec, 1, 200, [candidate()]); // inert: the revision_id JOIN mismatch (100 vs 200) excludes this page regardless of candidates
    const result = await selectEasyWinPageIds(exec, "v1");
    expect(result).toEqual([]);
  });

  it("excludes a page with an easy_win verdict at a different gate_version", async () => {
    const exec = freshTestExecutor();
    await upsertArticle(exec, article(1));
    await upsertVerdict(exec, verdict({ pageId: 1, revisionId: 100, gateVersion: "v2", eligibility: "easy_win" }));
    await insertCandidates(exec, 1, 100, [candidate()]);
    const result = await selectEasyWinPageIds(exec, "v1");
    expect(result).toEqual([]);
  });

  it("excludes a page with an easy_win verdict but zero stale_candidates rows", async () => {
    const exec = freshTestExecutor();
    await upsertArticle(exec, article(1));
    await upsertVerdict(exec, verdict({ pageId: 1, revisionId: 100, gateVersion: "v1", eligibility: "easy_win" }));
    // No insertCandidates call — zero candidates.
    const result = await selectEasyWinPageIds(exec, "v1");
    expect(result).toEqual([]);
  });

  it("returns results in ascending page_id order", async () => {
    const exec = freshTestExecutor();
    // Ascending page_id is the documented caller-visible contract.  It is enforced by
    // the query's ORDER BY a.page_id ASC and inherently reinforced by the WITHOUT ROWID
    // PK scan on the articles table (SQLite scans WITHOUT ROWID tables in PK order).
    // Because of the WITHOUT ROWID scan, this test asserts the contract rather than
    // isolating the ORDER BY clause — a test that could fail without ORDER BY is not
    // achievable with this schema.  Inserting pages in a non-sorted order still gives
    // a meaningful contract assertion.
    for (const pageId of [30, 10, 20]) {
      await upsertArticle(exec, article(pageId, 100));
      await upsertVerdict(exec, verdict({ pageId, revisionId: 100, gateVersion: "v1", eligibility: "easy_win" }));
      await insertCandidates(exec, pageId, 100, [candidate()]);
    }
    const result = await selectEasyWinPageIds(exec, "v1");
    expect(result).toEqual([10, 20, 30]);
  });
});
