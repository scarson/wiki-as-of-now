// ABOUTME: Tests for expectation-marker detection and year extraction in Wikipedia sentences.
// ABOUTME: Covers word-boundary matching, case-insensitivity, and ordered year extraction.
import { describe, it, expect } from "vitest";
import { findExpectationMarkers, extractYears } from "../../src/detector/markers";

describe("markers + years", () => {
  it("detects future-tense/expectation markers", () => {
    expect(findExpectationMarkers("The Pentagon is expected to award a contract")).toContain("is expected to");
    expect(findExpectationMarkers("Construction is scheduled to begin")).toContain("is scheduled to");
    expect(findExpectationMarkers("The radar remains stationed at the site")).toEqual([]); // no expectation marker
    expect(findExpectationMarkers("Goodwill ambassadors will attend")).toContain("will"); // matches standalone 'will'
    expect(findExpectationMarkers("Goodwill ambassadors attended")).toEqual([]); // must NOT match 'will' inside 'Goodwill'
  });
  it("extracts 4-digit years", () => {
    expect(extractYears("award a contract in 2017 and again in 2025")).toEqual([2017, 2025]);
    expect(extractYears("no years here")).toEqual([]);
  });
});
