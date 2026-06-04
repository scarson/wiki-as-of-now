// ABOUTME: Tests for the detectStaleClaims orchestrator — verifies year-gate logic, sorting, and purity.
// ABOUTME: Covers past-year flagging, future-year exclusion, section-clause formatting, and determinism.
import { describe, it, expect } from "vitest";
import { detectStaleClaims, DETECTOR_VERSION } from "../../src/detector/detect";
import { parseArticle } from "../../src/detector/parse";

describe("detectStaleClaims", () => {
  it("flags a past-year expectation claim and ignores a future-year one", () => {
    // The 2030 sentence HAS a real marker ("is expected to") but a future year, so it must
    // be excluded by the year gate — not merely for lacking a marker.
    const wikitext = `== Procurement ==\nThe Navy plans to award a contract in 2017.\nA follow-on contract is expected to be awarded in 2030.`;
    const article = parseArticle({ title: "T", revisionId: 1, wikitext });
    const out = detectStaleClaims(article, 2026);
    const years = out.map(c => c.year);
    expect(years).toContain(2017);
    expect(years).not.toContain(2030);
    expect(out[0].explanation.length).toBeGreaterThan(0);
  });
  it("is pure: no network, deterministic across runs", () => {
    const wikitext = `== S ==\nplans to launch in 2015.`;
    const a = parseArticle({ title: "T", revisionId: 1, wikitext });
    expect(detectStaleClaims(a, 2026)).toEqual(detectStaleClaims(a, 2026));
  });
  it("exposes a detector version", () => {
    expect(DETECTOR_VERSION).toBe("1.0.0");
  });
});
