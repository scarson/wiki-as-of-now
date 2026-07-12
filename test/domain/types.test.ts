// ABOUTME: Tests for the core domain types used across the stale-claim detector pipeline.
// ABOUTME: Verifies that StaleCandidate, ScoreBreakdown, and ParsedArticle are correctly shaped.
// test/domain/types.test.ts
import { describe, it, expect } from "vitest";
import type { ParsedArticle, StaleCandidate, ScoreBreakdown } from "../../src/domain/types";
describe("domain types", () => {
  it("StaleCandidate carries explanation + score breakdown", () => {
    const sb: ScoreBreakdown = { temporalRisk: 1, futureTenseConfidence: 1, suppression: 0, total: 2 };
    const c: StaleCandidate = {
      sentenceText: "x", sectionHeading: "S", year: 2017, marker: "is expected to",
      score: sb, explanation: "why", sectionIndex: 0, sentenceIndex: 1,
    };
    expect(c.score.total).toBe(2);
  });
  it("ParsedArticle nests sections and sentences", () => {
    const a: ParsedArticle = {
      title: "T", revisionId: 1,
      sections: [{ heading: "Procurement", level: 2, sentences: [{ text: "s" }] }],
    };
    expect(a.sections[0].sentences[0].text).toBe("s");
  });
});
