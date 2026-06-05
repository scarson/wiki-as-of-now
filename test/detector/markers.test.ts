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
  it("respects the 1900-2099 bounds and rejects longer digit runs", () => {
    expect(extractYears("1899 1900 2099 2100")).toEqual([1900, 2099]); // 1899 and 2100 excluded
    expect(extractYears("the code 20171 is not a year but 2017 is")).toEqual([2017]); // 5-digit run rejected
    expect(extractYears("range 2006-2007")).toEqual([2006, 2007]); // hyphen is a boundary: both endpoints
  });
  it("returns every distinct marker present, in lexicon order", () => {
    const found = findExpectationMarkers("It is expected to ship and will launch");
    expect(found).toContain("is expected to");
    expect(found).toContain("will");
    expect(found.indexOf("is expected to")).toBeLessThan(found.indexOf("will")); // lexicon order
  });
  it("does not match a marker straddling a word boundary", () => {
    expect(findExpectationMarkers("The thesis expected to confirm")).toEqual([]); // 'is expected to' inside 'thesis ...'
    expect(findExpectationMarkers("willingness to proceed")).toEqual([]); // 'will' inside 'willingness'
  });
});
