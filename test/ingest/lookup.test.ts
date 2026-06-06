// ABOUTME: Tests for the lookup orchestrator (src/ingest/lookup.ts): fetch → detect → persist → audit.
// ABOUTME: Injects a fetchFn serving a committed fixture and a pinned asOfYear; no live network.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { lookupAndPersist } from "../../src/ingest/lookup";
import { getCandidatesByPageId } from "../../src/db/articles";
import { makeAuditLog } from "../../src/db/audit-log";
import { parseArticle } from "../../src/detector/parse";
import { detectStaleClaims, DETECTOR_VERSION } from "../../src/detector/detect";
import type { FetchLike } from "../../src/ingest/wikimedia";
import { freshTestExecutor } from "../helpers/db";

const PAGE_ID = 60758751;
const REVISION_ID = 1357951754;
const FIXTURE = readFileSync("test/fixtures/artemis_program.wikitext", "utf8");
const AS_OF = 2026;

// Combined-metadata envelope: ns 0, a FIXED OLD revision timestamp (so freshness never fires),
// and no categories (→ blpProbe "absent" → the non-BLP article stays easy_win).
const fixtureFetch: FetchLike = async () => ({
  ok: true,
  status: 200,
  json: async () => ({
    query: {
      pages: [
        {
          pageid: PAGE_ID,
          ns: 0,
          title: "Artemis program",
          revisions: [{ revid: REVISION_ID, parentid: 1, timestamp: "2020-01-01T00:00:00Z", slots: { main: { content: FIXTURE } } }],
        },
      ],
    },
  }),
});

const NOW = new Date("2026-06-06T00:00:00Z");

describe("lookupAndPersist", () => {
  it("fetches, detects, persists, and returns the persisted candidates", async () => {
    const exec = freshTestExecutor();
    const result = await lookupAndPersist(exec, "Artemis program", { fetchFn: fixtureFetch, asOfYear: AS_OF, now: NOW });

    const expected = detectStaleClaims(
      parseArticle({ title: "Artemis program", revisionId: REVISION_ID, wikitext: FIXTURE }),
      AS_OF
    );
    expect(expected.length).toBeGreaterThan(0); // fixture must exercise the detector

    expect(result.pageId).toBe(PAGE_ID);
    expect(result.title).toBe("Artemis program");
    expect(result.revisionId).toBe(REVISION_ID);
    expect(result.candidateCount).toBe(expected.length);

    // Returned candidates are the persisted (read-back) set, equal to detector output.
    expect(result.candidates).toHaveLength(expected.length);
    expect(new Set(result.candidates.map(c => c.sentenceText))).toEqual(
      new Set(expected.map(c => c.sentenceText))
    );
    result.candidates.forEach(c => {
      expect(c.pageId).toBe(PAGE_ID);
      expect(c.sourceRevisionId).toBe(REVISION_ID);
      expect(c.detectorVersion).toBe(DETECTOR_VERSION);
    });
  });

  it("persists candidates readable through getCandidatesByPageId", async () => {
    const exec = freshTestExecutor();
    const result = await lookupAndPersist(exec, "Artemis program", { fetchFn: fixtureFetch, asOfYear: AS_OF, now: NOW });
    const reread = await getCandidatesByPageId(exec, PAGE_ID);
    expect(reread.map(c => c.id)).toEqual(result.candidates.map(c => c.id));
  });

  it("writes exactly one identifiers-only article.lookup audit row (no PII/content)", async () => {
    const exec = freshTestExecutor();
    const result = await lookupAndPersist(exec, "Artemis program", { fetchFn: fixtureFetch, asOfYear: AS_OF, now: NOW });

    const rows = await makeAuditLog(exec).read();
    const lookupRows = rows.filter(r => r.eventType === "article.lookup");
    expect(lookupRows).toHaveLength(1);
    expect(lookupRows[0].actor).toBe("system");
    expect(lookupRows[0].payload).toEqual({
      pageId: PAGE_ID,
      revisionId: REVISION_ID,
      candidateCount: result.candidateCount,
      detectorVersion: DETECTOR_VERSION,
    });
    // No document content / title leaked into the log.
    const serialized = JSON.stringify(lookupRows[0].payload);
    expect(serialized).not.toMatch(/Artemis/);
    expect(serialized).not.toMatch(/will|expected|scheduled/);
  });

  it("is idempotent across repeated lookups of the same page", async () => {
    const exec = freshTestExecutor();
    await lookupAndPersist(exec, "Artemis program", { fetchFn: fixtureFetch, asOfYear: AS_OF, now: NOW });
    const second = await lookupAndPersist(exec, "Artemis program", { fetchFn: fixtureFetch, asOfYear: AS_OF, now: NOW });
    const articles = await exec.prepare("SELECT page_id FROM articles").all<{ page_id: number }>();
    expect(articles).toHaveLength(1);
    const reread = await getCandidatesByPageId(exec, PAGE_ID);
    expect(reread).toHaveLength(second.candidateCount); // no duplicate accumulation
  });

  it("returns easy_win for a non-BLP article and logs an article.eligibility audit row", async () => {
    const exec = freshTestExecutor();
    const result = await lookupAndPersist(exec, "Artemis program", { fetchFn: fixtureFetch, asOfYear: AS_OF, now: NOW });
    expect(result.eligibility).toBe("easy_win");
    expect(result.reasons).toEqual([]);
    const rows = await makeAuditLog(exec).read();
    const elig = rows.find(r => r.eventType === "article.eligibility");
    expect(elig).toBeTruthy();
    expect(elig!.payload).toMatchObject({ pageId: PAGE_ID, eligibility: "easy_win", gateVersion: expect.any(String) });
    // identifiers/codes only — no title/content
    expect(JSON.stringify(elig!.payload)).not.toMatch(/Artemis|will|expected/);
  });

  it("returns human_only(blp_category) for a BLP envelope", async () => {
    const blpFetch: FetchLike = async () => ({ ok: true, status: 200, json: async () => ({
      query: { pages: [{ pageid: 30034, ns: 0, title: "Tim Berners-Lee",
        revisions: [{ revid: 999, parentid: 1, timestamp: "2020-01-01T00:00:00Z",
          slots: { main: { content: "Lead. [[Category:Living people]]" } } }],
        categories: [{ ns: 14, title: "Category:Living people" }] }] } }) });
    const exec = freshTestExecutor();
    const result = await lookupAndPersist(exec, "Tim Berners-Lee", { fetchFn: blpFetch, asOfYear: AS_OF, now: NOW });
    expect(result.eligibility).toBe("human_only");
    expect(result.reasons).toContain("blp_category");
  });
});
