// ABOUTME: Tests for the research provider interface and stub implementation.
// ABOUTME: Verifies the stub returns a well-typed, empty result with no candidates.
import { describe, it, expect } from "vitest";
import { StubResearchProvider } from "../../src/research/stub-provider";

describe("research provider stub", () => {
  it("returns an empty, typed result with no candidates", async () => {
    const p = new StubResearchProvider();
    const r = await p.research({ claimText: "x", sectionHeading: "S", year: 2017 });
    expect(r.candidates).toEqual([]);
    expect(r.providerName).toBe("stub");
  });
});
