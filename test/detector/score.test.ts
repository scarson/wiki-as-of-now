// ABOUTME: Tests for the explainable stale-claim scorer in src/detector/score.ts.
// ABOUTME: Verifies temporal-risk ordering, future-year zeroing, and explanation content.
import { describe, it, expect } from "vitest";
import { scoreClaim } from "../../src/detector/score";

describe("scoreClaim", () => {
  it("scores higher the further past the year is", () => {
    const recent = scoreClaim({ sentence: "plans to X in 2024", year: 2024, marker: "plans to", asOfYear: 2026 });
    const old = scoreClaim({ sentence: "plans to X in 2017", year: 2017, marker: "plans to", asOfYear: 2026 });
    expect(old.total).toBeGreaterThan(recent.total);
    expect(old.explanation).toContain("2017");
  });
  it("zeroes out when the year is not yet past", () => {
    const future = scoreClaim({ sentence: "plans to X in 2030", year: 2030, marker: "plans to", asOfYear: 2026 });
    expect(future.total).toBe(0);
  });
  it("treats year === asOfYear as not-yet-past (boundary)", () => {
    const now = scoreClaim({ sentence: "plans to X in 2026", year: 2026, marker: "plans to", asOfYear: 2026 });
    expect(now.total).toBe(0);
  });
  it("uses singular 'year' when exactly one year past", () => {
    const one = scoreClaim({ sentence: "plans to X in 2025", year: 2025, marker: "plans to", asOfYear: 2026 });
    expect(one.explanation).toContain("1 year past");
    expect(one.explanation).not.toContain("1 years past");
  });
  it("defaults an unknown marker to 0 confidence without producing NaN", () => {
    const r = scoreClaim({ sentence: "x in 2017", year: 2017, marker: "no-such-marker", asOfYear: 2026 });
    expect(Number.isFinite(r.total)).toBe(true);
    expect(r.breakdown.futureTenseConfidence).toBe(0);
    expect(r.total).toBe(9); // temporalRisk 9 + confidence 0 - suppression 0
  });
  it("subtracts suppression and keeps breakdown.total in sync with total", () => {
    const r = scoreClaim({
      sentence: 'A spokesman said it "is expected to launch in 2017".',
      year: 2017, marker: "is expected to", asOfYear: 2026,
    });
    expect(r.breakdown.suppression).toBeGreaterThan(0); // quotation rule fires
    expect(r.total).toBe(0); // veto-strength suppression drives total to 0
    expect(r.breakdown.total).toBe(r.total);
  });
});
