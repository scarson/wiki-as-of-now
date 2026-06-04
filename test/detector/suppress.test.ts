// ABOUTME: Tests for negative-pattern suppression — rules that reduce false positives
// ABOUTME: in stale-claim detection (historical narration, quotations, resolved claims).
import { describe, it, expect } from "vitest";
import { suppressionScore } from "../../src/detector/suppress";

describe("suppression", () => {
  it("suppresses historical narration framed in the past", () => {
    // "In 1944, the Army planned to..." — past-framed, not an unresolved expectation
    expect(suppressionScore("In 1944, the Army planned to invade.", 1944)).toBeGreaterThan(0);
  });
  it("suppresses direct quotations", () => {
    expect(suppressionScore('A spokesman said it "is expected to launch in 2017".', 2017)).toBeGreaterThan(0);
  });
  it("does not suppress a plain unresolved future-past claim", () => {
    expect(suppressionScore("The Navy plans to award a contract in 2017.", 2017)).toBe(0);
  });
  it("suppresses a month-dateline historical narration (frame year matches the claim year)", () => {
    // "In March 2013, the administration announced plans to..." — the year is the dateline of
    // a past announcement, not a forward target. Frame year 2013 == claim year 2013.
    expect(
      suppressionScore("In March 2013, the Obama administration announced plans to add 14 interceptors.", 2013)
    ).toBeGreaterThan(0);
  });
  it("suppresses a bare-year dateline regardless of the reporting verb", () => {
    // "In 2008, ... said ... will ..." — historical narration of a past statement; the old
    // verb-cue list ("planned|expected|was scheduled") missed reporting verbs like "said".
    expect(
      suppressionScore("In 2008, Rear Admiral Dwyer said these changes will make it possible.", 2008)
    ).toBeGreaterThan(0);
  });
  it("does not suppress a leading-dateline claim whose target year differs from the frame year", () => {
    // Frame year 2015 != claim year 2020 — the forward target (2020) is preserved, not narration.
    expect(
      suppressionScore("In 2015, the program was expected to deliver new radars in 2020.", 2020)
    ).toBe(0);
  });
});
