// ABOUTME: Tests for the research provider interface and stub implementation.
// ABOUTME: Verifies the stub returns proposals + queries + modelVersion with the new contract shape.
import { describe, it, expect } from "vitest";
import { StubResearchProvider } from "../../src/research/stub-provider";

describe("research provider stub", () => {
  it("returns empty proposals and queries with correct metadata", async () => {
    const p = new StubResearchProvider();
    const r = await p.research({ claimText: "x", sectionHeading: "S", year: 2017, sourceRevisionId: 1 });
    expect(r.proposals).toEqual([]);
    expect(r.queries).toEqual([]);
    expect(r.providerName).toBe("stub");
    expect(r.modelVersion).toBe("fake-provider/0");
  });
});
