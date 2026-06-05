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
          revisions: [{ revid: REVISION_ID, parentid: 1, slots: { main: { content: FIXTURE } } }],
        },
      ],
    },
  }),
});

describe("lookupAndPersist", () => {
  it("fetches, detects, persists, and returns the persisted candidates", async () => {
    const exec = freshTestExecutor();
    const result = await lookupAndPersist(exec, "Artemis program", { fetchFn: fixtureFetch, asOfYear: AS_OF });

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
    const result = await lookupAndPersist(exec, "Artemis program", { fetchFn: fixtureFetch, asOfYear: AS_OF });
    const reread = await getCandidatesByPageId(exec, PAGE_ID);
    expect(reread.map(c => c.id)).toEqual(result.candidates.map(c => c.id));
  });

  it("writes exactly one identifiers-only audit row (no PII/content)", async () => {
    const exec = freshTestExecutor();
    const result = await lookupAndPersist(exec, "Artemis program", { fetchFn: fixtureFetch, asOfYear: AS_OF });

    const rows = await makeAuditLog(exec).read();
    expect(rows).toHaveLength(1);
    expect(rows[0].actor).toBe("system");
    expect(rows[0].eventType).toBe("article.lookup");
    expect(rows[0].payload).toEqual({
      pageId: PAGE_ID,
      revisionId: REVISION_ID,
      candidateCount: result.candidateCount,
      detectorVersion: DETECTOR_VERSION,
    });
    // No document content / title leaked into the log.
    const serialized = JSON.stringify(rows[0].payload);
    expect(serialized).not.toMatch(/Artemis/);
    expect(serialized).not.toMatch(/will|expected|scheduled/);
  });

  it("is idempotent across repeated lookups of the same page", async () => {
    const exec = freshTestExecutor();
    await lookupAndPersist(exec, "Artemis program", { fetchFn: fixtureFetch, asOfYear: AS_OF });
    const second = await lookupAndPersist(exec, "Artemis program", { fetchFn: fixtureFetch, asOfYear: AS_OF });
    const articles = await exec.prepare("SELECT page_id FROM articles").all<{ page_id: number }>();
    expect(articles).toHaveLength(1);
    const reread = await getCandidatesByPageId(exec, PAGE_ID);
    expect(reread).toHaveLength(second.candidateCount); // no duplicate accumulation
  });
});
