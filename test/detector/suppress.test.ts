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
});
