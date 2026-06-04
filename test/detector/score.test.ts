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
});
