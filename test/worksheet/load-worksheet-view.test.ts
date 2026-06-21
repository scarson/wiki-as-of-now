// ABOUTME: Integration test for loadWorksheetView — assembles the worksheet from real D1 rows.
// ABOUTME: Real article + candidate + committed pack; asserts honesty state, verbatim cards, drift flag.
import { describe, it, expect, beforeEach } from "vitest";
import { freshTestExecutor } from "../helpers/db";
import type { SqlExecutor } from "../../src/db/client";
import { insertPackStatement, computeClaimKey } from "../../src/db/research-packs";
import { loadWorksheetView } from "../../src/worksheet/load-worksheet-view";

async function seedArticleAndCandidate(db: SqlExecutor) {
  await db.prepare("INSERT INTO articles (page_id, title, revision_id, fetched_at) VALUES (?,?,?,?)")
    .bind(42, "Example Program", 100, "2026-06-13T00:00:00.000Z").run();
  await db.prepare(
    "INSERT INTO stale_candidates (page_id, section_heading, sentence_text, year, marker, score, explanation, detector_version, source_revision_id) VALUES (?,?,?,?,?,?,?,?,?)",
  ).bind(42, "Development", "It is expected to deliver in 2020.", 2020, "expected to", 1.0, "Forward claim anchored to 2020.", "1.0.0", 100).run();
  const row = await db.prepare("SELECT id FROM stale_candidates WHERE page_id = 42").all<{ id: number }>();
  return row[0].id;
}

describe("loadWorksheetView", () => {
  let db: SqlExecutor;
  beforeEach(async () => { db = await freshTestExecutor(); });

  it("assembles a supported worksheet view from a committed pack with a verified card", async () => {
    const candidateId = await seedArticleAndCandidate(db);
    const claimKey = await computeClaimKey(42, "Development", "It is expected to deliver in 2020.", 2020);
    await insertPackStatement(db, {
      claimKey, sourceRevisionId: 100, pageId: 42, sectionHeading: "Development",
      sentenceText: "It is expected to deliver in 2020.", year: 2020,
      providerName: "fake", modelVersion: "fake-provider/0", status: "proposals_present",
      queries: ["delivery status example program"],
      cards: [{ url: "https://example.gov/r", verbatimQuote: "It delivered its first unit in 2024.", advisorySupport: true, contextBefore: null, contextAfter: null }],
      dispositions: [], evaluatedAt: "2026-06-13T00:00:00.000Z",
    }).run();

    const view = await loadWorksheetView(db, candidateId);
    if (view === null) throw new Error("expected a view");
    expect(view.claim.sentenceText).toBe("It is expected to deliver in 2020.");
    expect(view.claim.marker).toBe("expected to");
    expect(view.honesty.kind).toBe("supported");
    expect(view.honesty.revisionDrift).toBe(false);
    expect(view.cards).toHaveLength(1);
    expect(view.cards[0].verbatimQuote).toBe("It delivered its first unit in 2024.");
    expect(Object.keys(view.cards[0]).sort()).toEqual(["advisorySupport", "url", "verbatimQuote"]);
    expect(view.modelVersion).toBe("fake-provider/0");
  });

  it("flags article_changed_since_detection when the article advanced past the pack's revision", async () => {
    const candidateId = await seedArticleAndCandidate(db);
    const claimKey = await computeClaimKey(42, "Development", "It is expected to deliver in 2020.", 2020);
    await insertPackStatement(db, {
      claimKey, sourceRevisionId: 100, pageId: 42, sectionHeading: "Development",
      sentenceText: "It is expected to deliver in 2020.", year: 2020,
      providerName: "fake", modelVersion: "fake-provider/0", status: "proposals_present",
      queries: ["q"],
      cards: [{ url: "https://example.gov/r", verbatimQuote: "It delivered its first unit in 2024.", advisorySupport: true, contextBefore: null, contextAfter: null }],
      dispositions: [], evaluatedAt: "2026-06-13T00:00:00.000Z",
    }).run();
    // Advance the article past the pack's source revision (100 → 137).
    await db.prepare("UPDATE articles SET revision_id = 137 WHERE page_id = 42").run();

    const view = await loadWorksheetView(db, candidateId);
    if (view === null) throw new Error("expected a view");
    expect(view.honesty.kind).toBe("article_changed_since_detection");
    expect(view.honesty.revisionDrift).toBe(true);
    expect(view.cards).toEqual([]); // a drifted pack is NOT surfaced as current (Phase 2 returns revision_drift)
  });

  it("returns provider_unavailable honesty when no pack was ever committed (same revision)", async () => {
    const candidateId = await seedArticleAndCandidate(db);
    const view = await loadWorksheetView(db, candidateId);
    if (view === null) throw new Error("expected a view");
    expect(view.honesty.kind).toBe("provider_unavailable");
    expect(view.cards).toEqual([]);
  });

  it("returns null for an unknown candidate id (no existence oracle, no throw)", async () => {
    const view = await loadWorksheetView(db, 999999);
    expect(view).toBeNull();
  });
});
