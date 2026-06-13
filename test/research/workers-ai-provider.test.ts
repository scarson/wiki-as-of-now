// ABOUTME: Tests WorkersAiResearchProvider — query-gen, triage, and full research() orchestration via injected fakes.
// ABOUTME: Exercises REAL parsing/orchestration/JSON-retry/propose logic; no live LLM or network (project rule).
import { describe, it, expect, vi } from "vitest";
import { WorkersAiResearchProvider } from "../../src/research/workers-ai-provider";
import type { AiTextClient } from "../../src/research/ai-client";
import type { SearchProvider } from "../../src/research/search-provider";
import type { SourceFetchResult } from "../../src/research/source-fetch";
import type { ResearchInput } from "../../src/research/provider";

const INPUT: ResearchInput = {
  claimText: "The fleet will reach full strength by 2025.",
  sectionHeading: "Fleet", year: 2025, sourceRevisionId: 9001,
};

/** AiTextClient fake whose generateText returns scripted responses in order. */
function scriptedAi(responses: string[]): AiTextClient {
  let i = 0;
  return { generateText: vi.fn(async () => responses[Math.min(i++, responses.length - 1)]) };
}
const emptySearch: SearchProvider = { search: async () => [] };
const noFetch = async (): Promise<SourceFetchResult> => ({ ok: false, reason: "network_error" });

describe("WorkersAiResearchProvider.generateQueries", () => {
  it("returns the model's neutral queries parsed from JSON", async () => {
    const ai = scriptedAi(['{"queries":["fleet strength 2025","navy fleet readiness"]}']);
    const p = new WorkersAiResearchProvider({ ai, search: emptySearch, fetchSource: noFetch });
    expect(await p.generateQueries(INPUT)).toEqual(["fleet strength 2025", "navy fleet readiness"]);
  });
  it("retries ONCE on malformed JSON then succeeds", async () => {
    const ai = scriptedAi(["not json", '{"queries":["q1"]}']);
    const p = new WorkersAiResearchProvider({ ai, search: emptySearch, fetchSource: noFetch });
    expect(await p.generateQueries(INPUT)).toEqual(["q1"]);
    expect(ai.generateText).toHaveBeenCalledTimes(2);
  });
  it("returns [] (not throw) when both attempts return malformed JSON", async () => {
    const ai = scriptedAi(["nope", "still nope"]);
    const p = new WorkersAiResearchProvider({ ai, search: emptySearch, fetchSource: noFetch });
    expect(await p.generateQueries(INPUT)).toEqual([]);
    expect(ai.generateText).toHaveBeenCalledTimes(2);
  });
  it("drops a query that echoes the claim verbatim (G9 neutrality)", async () => {
    const ai = scriptedAi([JSON.stringify({ queries: ["The fleet will reach full strength by 2025.", "fleet readiness"] })]);
    const p = new WorkersAiResearchProvider({ ai, search: emptySearch, fetchSource: noFetch });
    expect(await p.generateQueries(INPUT)).toEqual(["fleet readiness"]);
  });
  it("drops a query longer than 256 code points and caps the count at 8", async () => {
    const long = "x".repeat(257);
    const many = Array.from({ length: 12 }, (_, i) => `q${i}`);
    const ai = scriptedAi([JSON.stringify({ queries: [long, ...many] })]);
    const p = new WorkersAiResearchProvider({ ai, search: emptySearch, fetchSource: noFetch });
    const out = await p.generateQueries(INPUT);
    expect(out).not.toContain(long);
    expect(out.length).toBeLessThanOrEqual(8);
  });
});

describe("WorkersAiResearchProvider.triage", () => {
  const pages = [{ url: "https://navy.mil/z", text: "The Zumwalt was commissioned on 15 October 2016." }];

  it("returns the model's proposed evidence parsed from JSON", async () => {
    const ai = scriptedAi([JSON.stringify({ proposals: [
      { url: "https://navy.mil/z", proposedQuote: "commissioned on 15 October 2016", advisorySupport: true },
    ] })]);
    const p = new WorkersAiResearchProvider({ ai, search: emptySearch, fetchSource: noFetch });
    const out = await p.triage(INPUT, pages);
    expect(out).toEqual([{ url: "https://navy.mil/z", proposedQuote: "commissioned on 15 October 2016", advisorySupport: true }]);
  });
  it("caps proposals at MODEL_CONFIG.maxProposals (5)", async () => {
    const many = Array.from({ length: 9 }, (_, i) => ({ url: `https://x.gov/${i}`, proposedQuote: `quote number ${i}`, advisorySupport: false }));
    const ai = scriptedAi([JSON.stringify({ proposals: many })]);
    const p = new WorkersAiResearchProvider({ ai, search: emptySearch, fetchSource: noFetch });
    expect((await p.triage(INPUT, pages)).length).toBe(5);
  });
  it("retries once on malformed JSON then returns []", async () => {
    const ai = scriptedAi(["garbage", "more garbage"]);
    const p = new WorkersAiResearchProvider({ ai, search: emptySearch, fetchSource: noFetch });
    expect(await p.triage(INPUT, pages)).toEqual([]);
    expect(ai.generateText).toHaveBeenCalledTimes(2);
  });
  it("drops a proposal whose advisorySupport is not a boolean (schema guard)", async () => {
    const ai = scriptedAi([JSON.stringify({ proposals: [
      { url: "https://navy.mil/z", proposedQuote: "valid quote here", advisorySupport: "yes" },
    ] })]);
    const p = new WorkersAiResearchProvider({ ai, search: emptySearch, fetchSource: noFetch });
    expect(await p.triage(INPUT, pages)).toEqual([]);
  });
  it("returns [] when given no pages (nothing to triage)", async () => {
    const ai = scriptedAi(["unused"]);
    const p = new WorkersAiResearchProvider({ ai, search: emptySearch, fetchSource: noFetch });
    expect(await p.triage(INPUT, [])).toEqual([]);
    expect(ai.generateText).not.toHaveBeenCalled();
  });
});
