// ABOUTME: Unit tests for the marker-governs-year eligibility filter.
import { describe, it, expect } from "vitest";
import { yearOccurrences, governedYears } from "../../src/detector/governs";

describe("yearOccurrences", () => {
  it("returns each 4-digit year with its character span, in order", () => {
    const occ = yearOccurrences("built in 1910 and 2024");
    expect(occ).toEqual([
      { value: 1910, start: 9, end: 13 },
      { value: 2024, start: 18, end: 22 },
    ]);
  });
});

describe("governedYears (identity baseline — before discriminators)", () => {
  it("returns all past years when none are incidental", () => {
    expect(governedYears("X is expected to deliver in 2020", "is expected to", [2020])).toEqual([2020]);
  });
  it("returns distinct values only", () => {
    expect(governedYears("expected in 2020, again in 2020", "expected to", [2020])).toEqual([2020]);
  });
});
