// ABOUTME: Tests for selectResearchSeeds — live-revision easy-win candidate seeder.
// ABOUTME: Covers happy path, superseded revision exclusion, PK dedup, NFC/NFD collapse, limit, and fully-packed pages.
import { describe, it, expect } from "vitest";
import { selectResearchSeeds } from "../../src/queue/seed";
import { computeClaimKey, insertPackIfAbsent, type ResearchPack } from "../../src/db/research-packs";
import { upsertArticle } from "../../src/db/articles";
import { upsertVerdict } from "../../src/db/eligibility-verdicts";
import { freshTestExecutor } from "../helpers/db";
import { GATE_VERSION } from "../../src/safelane/eligibility";
import type { SqlExecutor } from "../../src/db/client";

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

const FETCHED_AT = "2026-06-07T00:00:00.000Z";
const EVALUATED_AT = "2026-06-07T00:00:00.000Z";

async function seedArticle(exec: SqlExecutor, pageId: number, revisionId: number): Promise<void> {
  await upsertArticle(exec, {
    pageId,
    title: `Article ${pageId}`,
    revisionId,
    fetchedAt: FETCHED_AT,
  });
}

async function seedEasyWinVerdict(exec: SqlExecutor, pageId: number, revisionId: number, gateVersion = GATE_VERSION): Promise<void> {
  await upsertVerdict(exec, {
    pageId,
    revisionId,
    gateVersion,
    eligibility: "easy_win",
    reasons: [],
    evaluatedAt: EVALUATED_AT,
  });
}

async function insertCandidate(
  exec: SqlExecutor,
  pageId: number,
  sectionHeading: string,
  sentenceText: string,
  year: number,
  sourceRevisionId: number,
  surroundingText: string | null = null,
): Promise<void> {
  await exec
    .prepare(
      "INSERT INTO stale_candidates " +
        "(page_id, section_heading, sentence_text, year, marker, score, explanation, detector_version, source_revision_id, surrounding_text) " +
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
    )
    .bind(pageId, sectionHeading, sentenceText, year, "will", 5.0, "Future-tense claim.", "test/1.0", sourceRevisionId, surroundingText)
    .run();
}

/** Minimal valid ResearchPack for test insertion (not used as a real pack — just seeds the row). */
function makeTestPack(overrides: Partial<ResearchPack>): ResearchPack {
  return {
    claimKey: "deadbeef",
    sourceRevisionId: 100,
    pageId: 1,
    sectionHeading: "History",
    sentenceText: "placeholder",
    year: 2020,
    providerName: "fake-provider",
    modelVersion: "fake-provider/0",
    status: "no_proposals",
    queries: [],
    cards: [],
    dispositions: [],
    evaluatedAt: EVALUATED_AT,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// (a) Happy path
// ---------------------------------------------------------------------------

describe("selectResearchSeeds — happy path", () => {
  it("returns one ResearchMessage per distinct easy-win candidate at the live revision", async () => {
    const exec = freshTestExecutor();
    const PAGE_ID = 10;
    const REV_ID = 100;
    await seedArticle(exec, PAGE_ID, REV_ID);
    await seedEasyWinVerdict(exec, PAGE_ID, REV_ID);
    await insertCandidate(exec, PAGE_ID, "History", "The fleet deployed.", 2025, REV_ID);

    const results = await selectResearchSeeds(exec, { gateVersion: GATE_VERSION, limit: 10 });

    expect(results).toHaveLength(1);
    const msg = results[0];
    expect(msg.pageId).toBe(PAGE_ID);
    expect(msg.sourceRevisionId).toBe(REV_ID);

    // Assert claimKey equals independent computeClaimKey
    const expectedKey = await computeClaimKey(PAGE_ID, "History", "The fleet deployed.", 2025);
    expect(msg.claimKey).toBe(expectedKey);

    // Assert full message shape — articleTitle comes from the articles join; no surrounding
    // text was captured for this row, so the optional field is absent (never a JSON null).
    expect(msg.input).toEqual({
      claimText: "The fleet deployed.",
      sectionHeading: "History",
      year: 2025,
      sourceRevisionId: REV_ID,
      articleTitle: "Article 10",
    });
  });

  it("carries surroundingText into the research input when the candidate row has it", async () => {
    const exec = freshTestExecutor();
    await seedArticle(exec, 11, 110);
    await seedEasyWinVerdict(exec, 11, 110);
    await insertCandidate(exec, 11, "History", "The fleet deployed.", 2025, 110,
      "Orders were placed. The fleet deployed. Reviews followed.");

    const results = await selectResearchSeeds(exec, { gateVersion: GATE_VERSION, limit: 10 });
    expect(results).toHaveLength(1);
    expect(results[0].input.articleTitle).toBe("Article 11");
    expect(results[0].input.surroundingText).toBe("Orders were placed. The fleet deployed. Reviews followed.");
  });
});

// ---------------------------------------------------------------------------
// (b) Superseded revision excluded
// ---------------------------------------------------------------------------

describe("selectResearchSeeds — superseded revision excluded", () => {
  it("excludes a candidate whose source_revision_id !== articles.revision_id", async () => {
    const exec = freshTestExecutor();
    const PAGE_ID = 20;
    const OLD_REV = 1;
    const NEW_REV = 2;

    // Article is at NEW_REV; candidate was detected at OLD_REV.
    await seedArticle(exec, PAGE_ID, NEW_REV);
    await seedEasyWinVerdict(exec, PAGE_ID, NEW_REV);
    await insertCandidate(exec, PAGE_ID, "Background", "Old claim text.", 2020, OLD_REV);

    const results = await selectResearchSeeds(exec, { gateVersion: GATE_VERSION, limit: 10 });
    expect(results).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// (c) Already-packed dedup uses (claim_key, source_revision_id)
// ---------------------------------------------------------------------------

describe("selectResearchSeeds — already-packed dedup uses full PK", () => {
  it("excludes a candidate already packed for (claimKey, source_revision_id)", async () => {
    const exec = freshTestExecutor();
    const PAGE_ID = 30;
    const REV_ID = 100;
    const SECTION = "History";
    const SENTENCE = "The ship launched.";
    const YEAR = 2022;

    await seedArticle(exec, PAGE_ID, REV_ID);
    await seedEasyWinVerdict(exec, PAGE_ID, REV_ID);
    await insertCandidate(exec, PAGE_ID, SECTION, SENTENCE, YEAR, REV_ID);

    const claimKey = await computeClaimKey(PAGE_ID, SECTION, SENTENCE, YEAR);
    await insertPackIfAbsent(exec, makeTestPack({ claimKey, sourceRevisionId: REV_ID, pageId: PAGE_ID }));

    // This candidate IS easy-win at live rev but already packed — excluded.
    const results = await selectResearchSeeds(exec, { gateVersion: GATE_VERSION, limit: 10 });
    expect(results).toHaveLength(0);
  });

  it("a pack at a DIFFERENT source_revision_id does NOT exclude the live-revision candidate", async () => {
    const exec = freshTestExecutor();
    const PAGE_ID = 31;
    const LIVE_REV = 200;
    const OLD_REV = 100;
    const SECTION = "Background";
    const SENTENCE = "The satellite orbited.";
    const YEAR = 2021;

    await seedArticle(exec, PAGE_ID, LIVE_REV);
    await seedEasyWinVerdict(exec, PAGE_ID, LIVE_REV);
    await insertCandidate(exec, PAGE_ID, SECTION, SENTENCE, YEAR, LIVE_REV);

    // Pack exists only for OLD_REV, not LIVE_REV — must NOT exclude the live-rev candidate.
    const claimKey = await computeClaimKey(PAGE_ID, SECTION, SENTENCE, YEAR);
    await insertPackIfAbsent(exec, makeTestPack({ claimKey, sourceRevisionId: OLD_REV, pageId: PAGE_ID }));

    const results = await selectResearchSeeds(exec, { gateVersion: GATE_VERSION, limit: 10 });
    expect(results).toHaveLength(1);
    expect(results[0].claimKey).toBe(claimKey);
    expect(results[0].sourceRevisionId).toBe(LIVE_REV);
  });
});

// ---------------------------------------------------------------------------
// (d) Duplicate candidate rows collapse
// ---------------------------------------------------------------------------

describe("selectResearchSeeds — duplicate candidate rows collapse", () => {
  it("two identical stale_candidates rows produce exactly one message", async () => {
    const exec = freshTestExecutor();
    const PAGE_ID = 40;
    const REV_ID = 100;

    await seedArticle(exec, PAGE_ID, REV_ID);
    await seedEasyWinVerdict(exec, PAGE_ID, REV_ID);

    // Insert the SAME candidate twice (no unique constraint on stale_candidates).
    await insertCandidate(exec, PAGE_ID, "History", "Duplicate claim.", 2023, REV_ID);
    await insertCandidate(exec, PAGE_ID, "History", "Duplicate claim.", 2023, REV_ID);

    const results = await selectResearchSeeds(exec, { gateVersion: GATE_VERSION, limit: 10 });
    expect(results).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// (e) NFC/NFD variants collapse to ONE message (the load-bearing dedup-identity test)
// ---------------------------------------------------------------------------

describe("selectResearchSeeds — NFC/NFD byte-variants collapse via in-memory claimKey dedup", () => {
  it("NFC and NFD variants of section_heading produce the same claimKey and collapse to one message", async () => {
    const exec = freshTestExecutor();
    const PAGE_ID = 50;
    const REV_ID = 100;
    const YEAR = 2024;

    // NFC form: U+00E9 (precomposed é)
    // NFD form: e (U+0065) + combining acute accent (U+0301)
    // Write ONLY as \uXXXX escapes — never pasted literal characters.
    const sectionNfc = "Caf\u00e9";     // NFC: precomposed e-acute (U+00E9)
    const sectionNfd = "Cafe\u0301";    // NFD: e (U+0065) + combining acute (U+0301)
    const SENTENCE = "The machine arrived.";

    await seedArticle(exec, PAGE_ID, REV_ID);
    await seedEasyWinVerdict(exec, PAGE_ID, REV_ID);

    // Two stale_candidates rows — byte-distinct in section_heading but same claimKey after NFC fold.
    await insertCandidate(exec, PAGE_ID, sectionNfc, SENTENCE, YEAR, REV_ID);
    await insertCandidate(exec, PAGE_ID, sectionNfd, SENTENCE, YEAR, REV_ID);

    // Both produce the same claimKey (computeClaimKey NFC-folds).
    const keyNfc = await computeClaimKey(PAGE_ID, sectionNfc, SENTENCE, YEAR);
    const keyNfd = await computeClaimKey(PAGE_ID, sectionNfd, SENTENCE, YEAR);
    // Pre-condition: these are indeed the same key.
    expect(keyNfc).toBe(keyNfd);

    const results = await selectResearchSeeds(exec, { gateVersion: GATE_VERSION, limit: 10 });
    // SQL DISTINCT sees two byte-distinct section_heading rows, but in-memory claimKey dedup collapses to 1.
    expect(results).toHaveLength(1);
    expect(results[0].claimKey).toBe(keyNfc);
  });
});

// ---------------------------------------------------------------------------
// (f) Respects limit and is deterministic
// ---------------------------------------------------------------------------

describe("selectResearchSeeds — respects limit and is deterministic", () => {
  it("returns at most limit messages when more distinct easy-win claims exist", async () => {
    const exec = freshTestExecutor();
    const REV_ID = 100;
    // Seed 5 pages, each with one easy-win candidate.
    for (let i = 1; i <= 5; i++) {
      const PAGE_ID = 100 + i;
      await seedArticle(exec, PAGE_ID, REV_ID);
      await seedEasyWinVerdict(exec, PAGE_ID, REV_ID);
      await insertCandidate(exec, PAGE_ID, "History", `Claim ${i}.`, 2020 + i, REV_ID);
    }

    const results = await selectResearchSeeds(exec, { gateVersion: GATE_VERSION, limit: 3 });
    expect(results.length).toBeLessThanOrEqual(3);
    expect(results.length).toBeGreaterThan(0);
  });

  it("two calls with the same inputs return the same order (deterministic)", async () => {
    const exec = freshTestExecutor();
    const REV_ID = 100;
    for (let i = 1; i <= 4; i++) {
      const PAGE_ID = 200 + i;
      await seedArticle(exec, PAGE_ID, REV_ID);
      await seedEasyWinVerdict(exec, PAGE_ID, REV_ID);
      await insertCandidate(exec, PAGE_ID, "Background", `Determinism claim ${i}.`, 2019 + i, REV_ID);
    }

    const r1 = await selectResearchSeeds(exec, { gateVersion: GATE_VERSION, limit: 4 });
    const r2 = await selectResearchSeeds(exec, { gateVersion: GATE_VERSION, limit: 4 });
    expect(r1.map(m => m.claimKey)).toEqual(r2.map(m => m.claimKey));
  });
});

// ---------------------------------------------------------------------------
// (g) All-packed page contributes nothing
// ---------------------------------------------------------------------------

describe("selectResearchSeeds — all-packed page contributes nothing", () => {
  it("a page where every easy-win candidate is already packed returns no messages for that page", async () => {
    const exec = freshTestExecutor();
    const PAGE_ID = 60;
    const REV_ID = 100;
    const SECTION = "Conclusion";
    const SENTENCE = "The project completed.";
    const YEAR = 2019;

    await seedArticle(exec, PAGE_ID, REV_ID);
    await seedEasyWinVerdict(exec, PAGE_ID, REV_ID);
    await insertCandidate(exec, PAGE_ID, SECTION, SENTENCE, YEAR, REV_ID);

    const claimKey = await computeClaimKey(PAGE_ID, SECTION, SENTENCE, YEAR);
    await insertPackIfAbsent(exec, makeTestPack({ claimKey, sourceRevisionId: REV_ID, pageId: PAGE_ID }));

    const results = await selectResearchSeeds(exec, { gateVersion: GATE_VERSION, limit: 10 });
    expect(results.filter(m => m.pageId === PAGE_ID)).toHaveLength(0);
  });
});
