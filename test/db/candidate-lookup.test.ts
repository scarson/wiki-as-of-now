// ABOUTME: Tests for getCandidateById — single stale-candidate read by surrogate id against real D1.
// ABOUTME: Covers the happy path (fields the enqueue route needs) and the unknown-id null path.
import { describe, it, expect } from "vitest";
import { freshTestExecutor } from "../helpers/db";
import { upsertArticle } from "../../src/db/articles";
import { getCandidateById } from "../../src/db/candidate-lookup";

async function seedCandidate(db: ReturnType<typeof freshTestExecutor>, surroundingText: string | null = null) {
  await upsertArticle(db, { pageId: 42, title: "Zumwalt", revisionId: 9001, fetchedAt: new Date().toISOString() });
  await db.prepare(
    "INSERT INTO stale_candidates (page_id, section_heading, sentence_text, year, marker, score, explanation, detector_version, source_revision_id, surrounding_text) " +
    "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
  ).bind(42, "Fleet", "The fleet will reach full strength by 2025.", 2025, "will", 1.5, "marker+year", "1.0.0", 9001, surroundingText).run();
  const rows = await db.prepare("SELECT id FROM stale_candidates WHERE page_id = 42").all<{ id: number }>();
  return rows[0].id;
}

describe("getCandidateById", () => {
  it("reads a single candidate with the fields the enqueue route needs", async () => {
    const db = freshTestExecutor();
    const id = await seedCandidate(db);
    const c = await getCandidateById(db, id);
    expect(c).not.toBeNull();
    expect(c).toMatchObject({
      id, pageId: 42, sectionHeading: "Fleet",
      sentenceText: "The fleet will reach full strength by 2025.",
      year: 2025, sourceRevisionId: 9001,
    });
  });
  it("joins the article title and carries surroundingText for the research input", async () => {
    const db = freshTestExecutor();
    const id = await seedCandidate(db, "Ordered in 2020. The fleet will reach full strength by 2025. Delays followed.");
    const c = await getCandidateById(db, id);
    expect(c?.articleTitle).toBe("Zumwalt");
    expect(c?.surroundingText).toBe("Ordered in 2020. The fleet will reach full strength by 2025. Delays followed.");
  });
  it("carries null surroundingText for a pre-migration row", async () => {
    const db = freshTestExecutor();
    const id = await seedCandidate(db, null);
    const c = await getCandidateById(db, id);
    expect(c?.articleTitle).toBe("Zumwalt");
    expect(c?.surroundingText).toBeNull();
  });
  it("returns null for an unknown candidate id (no existence oracle, no throw)", async () => {
    const db = freshTestExecutor();
    expect(await getCandidateById(db, 999999)).toBeNull();
  });
});
