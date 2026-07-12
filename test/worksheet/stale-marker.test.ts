// ABOUTME: Tests for splitSentenceAroundMarker — the stale-marker span split.
// ABOUTME: Verifies the rust underline wraps only the marker phrase, never the whole sentence.
import { describe, it, expect } from "vitest";
import { splitSentenceAroundMarker } from "../../src/worksheet/stale-marker";

describe("splitSentenceAroundMarker", () => {
  it("splits a sentence into before / staleSpan / after around the first marker occurrence", () => {
    const r = splitSentenceAroundMarker("The program is expected to deliver in 2020.", "expected to");
    expect(r).toEqual({
      before: "The program is ",
      staleSpan: "expected to",
      after: " deliver in 2020.",
    });
  });

  it("matches the FIRST occurrence only when the marker repeats", () => {
    const r = splitSentenceAroundMarker("It will, as planned, will ship.", "will");
    expect(r.before).toBe("It ");
    expect(r.staleSpan).toBe("will");
    expect(r.after).toBe(", as planned, will ship.");
  });

  it("returns the whole sentence as 'before' with an empty staleSpan when the marker is absent", () => {
    const r = splitSentenceAroundMarker("No marker here.", "scheduled to");
    expect(r).toEqual({ before: "No marker here.", staleSpan: "", after: "" });
  });

  it("handles an empty marker by not marking anything (whole sentence is 'before')", () => {
    const r = splitSentenceAroundMarker("Anything.", "");
    expect(r).toEqual({ before: "Anything.", staleSpan: "", after: "" });
  });

  it("is exact on multi-byte / combining-char sentences (no index drift)", () => {
    // 'café' uses a combining acute; the marker sits after it.
    const sentence = "The café is expected to reopen in 2019.";
    const r = splitSentenceAroundMarker(sentence, "expected to");
    expect(r.before + r.staleSpan + r.after).toBe(sentence);
    expect(r.staleSpan).toBe("expected to");
  });

  it("never loses or duplicates characters — concatenation round-trips for any match", () => {
    const sentence = "X scheduled to Y scheduled to Z.";
    const r = splitSentenceAroundMarker(sentence, "scheduled to");
    expect(r.before + r.staleSpan + r.after).toBe(sentence);
  });
});
