// ABOUTME: Tests WorkersAiResearchProvider — query-gen, triage, and full research() orchestration via injected fakes.
// ABOUTME: Exercises REAL parsing/orchestration/JSON-retry/propose logic; no live LLM or network (project rule).
import { describe, it, expect, vi } from "vitest";
import { WorkersAiResearchProvider } from "../../src/research/workers-ai-provider";
import type { AiTextClient } from "../../src/research/ai-client";
import type { SearchProvider, SearchHit } from "../../src/research/search-provider";
import type { SourceFetchResult, UntrustedSourceText } from "../../src/research/source-fetch";
import type { FetchedPage } from "../../src/research/workers-ai-provider";
import type { ResearchInput } from "../../src/research/provider";

/** Build a FetchedPage with the UntrustedSourceText brand preserved (the production type, G15). */
const page = (url: string, text: string): FetchedPage => ({ url, text: text as UntrustedSourceText });

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
  it("returns [] on valid JSON of the WRONG SHAPE both attempts (queries is not an array)", async () => {
    const ai = scriptedAi(['{"queries":"not array"}', '{"queries":"not array"}']);
    const p = new WorkersAiResearchProvider({ ai, search: emptySearch, fetchSource: noFetch });
    expect(await p.generateQueries(INPUT)).toEqual([]);
    expect(ai.generateText).toHaveBeenCalledTimes(2);
  });
  it("puts articleTitle and surroundingText into the query-gen prompt as claim data", async () => {
    let prompt = "";
    const ai: AiTextClient = { generateText: vi.fn(async (_m: string, p: string) => { prompt = p; return '{"queries":["q"]}'; }) };
    const p = new WorkersAiResearchProvider({ ai, search: emptySearch, fetchSource: noFetch });
    await p.generateQueries({
      ...INPUT,
      articleTitle: "California High-Speed Rail",
      surroundingText: "The Authority was created in 1996. The fleet will reach full strength by 2025.",
    });
    expect(prompt).toContain("Article: California High-Speed Rail");
    expect(prompt).toContain("Context: The Authority was created in 1996. The fleet will reach full strength by 2025.");
  });
  it("omits the Article/Context lines when the input carries neither", async () => {
    let prompt = "";
    const ai: AiTextClient = { generateText: vi.fn(async (_m: string, p: string) => { prompt = p; return '{"queries":["q"]}'; }) };
    const p = new WorkersAiResearchProvider({ ai, search: emptySearch, fetchSource: noFetch });
    await p.generateQueries(INPUT);
    expect(prompt).not.toContain("Article:");
    expect(prompt).not.toContain("Context:");
  });
});

describe("WorkersAiResearchProvider.triage", () => {
  const pages = [page("https://navy.mil/z", "The Zumwalt was commissioned on 15 October 2016.")];

  it("returns the model's proposed evidence parsed from JSON", async () => {
    const ai = scriptedAi([JSON.stringify({ proposals: [
      { url: "https://navy.mil/z", proposedQuote: "commissioned on 15 October 2016", advisorySupport: true },
    ] })]);
    const p = new WorkersAiResearchProvider({ ai, search: emptySearch, fetchSource: noFetch });
    const out = await p.triage(INPUT, pages);
    expect(out).toEqual([{ url: "https://navy.mil/z", proposedQuote: "commissioned on 15 October 2016", advisorySupport: true }]);
  });
  it("puts articleTitle and surroundingText into the triage prompt's claim block", async () => {
    let prompt = "";
    const ai: AiTextClient = { generateText: vi.fn(async (_m: string, p: string) => { prompt = p; return '{"proposals":[]}'; }) };
    const p = new WorkersAiResearchProvider({ ai, search: emptySearch, fetchSource: noFetch });
    await p.triage({ ...INPUT, articleTitle: "Zumwalt-class destroyer", surroundingText: "Before. Claim. After." }, pages);
    expect(prompt).toContain("Article: Zumwalt-class destroyer");
    expect(prompt).toContain("Context: Before. Claim. After.");
  });
  it("caps proposals at MODEL_CONFIG.maxProposals (5)", async () => {
    // All proposals point at the single fetched page (in-set) so the cap, not the url filter, is what trims.
    const many = Array.from({ length: 9 }, (_, i) => ({ url: pages[0].url, proposedQuote: `quote number ${i}`, advisorySupport: false }));
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
  it("drops a proposal whose url is not one of the fetched pages (G9 job-c / G15: box the model to a retrieved page)", async () => {
    const ai = scriptedAi([JSON.stringify({ proposals: [
      { url: "https://navy.mil/z", proposedQuote: "in-set quote", advisorySupport: true },
      { url: "https://evil.example/inject", proposedQuote: "off-set quote", advisorySupport: true },
    ] })]);
    const p = new WorkersAiResearchProvider({ ai, search: emptySearch, fetchSource: noFetch });
    const out = await p.triage(INPUT, pages); // pages = [{ url: "https://navy.mil/z", ... }]
    expect(out).toEqual([{ url: "https://navy.mil/z", proposedQuote: "in-set quote", advisorySupport: true }]);
  });
  it("returns [] on valid JSON of the WRONG SHAPE both attempts (proposals is an object, not an array)", async () => {
    const ai = scriptedAi(['{"proposals":{}}', '{"proposals":{}}']);
    const p = new WorkersAiResearchProvider({ ai, search: emptySearch, fetchSource: noFetch });
    expect(await p.triage(INPUT, pages)).toEqual([]);
    expect(ai.generateText).toHaveBeenCalledTimes(2);
  });
  it("returns [] when given no pages (nothing to triage)", async () => {
    const ai = scriptedAi(["unused"]);
    const p = new WorkersAiResearchProvider({ ai, search: emptySearch, fetchSource: noFetch });
    expect(await p.triage(INPUT, [])).toEqual([]);
    expect(ai.generateText).not.toHaveBeenCalled();
  });
});

describe("WorkersAiResearchProvider.research (full orchestration)", () => {
  const okFetch = (text: string) => async (): Promise<SourceFetchResult> =>
    ({ ok: true, text: text as never });

  it("runs query-gen → search → fetch → triage and returns ProviderResearch with the full model id (G12)", async () => {
    const ai = scriptedAi([
      JSON.stringify({ queries: ["zumwalt 2016 commissioning"] }),                           // query-gen
      JSON.stringify({ proposals: [{ url: "https://navy.mil/z", proposedQuote: "commissioned on 15 October 2016", advisorySupport: true }] }), // triage
    ]);
    const search: SearchProvider = { search: async (): Promise<SearchHit[]> => [{ url: "https://navy.mil/z" }] };
    const p = new WorkersAiResearchProvider({ ai, search, fetchSource: okFetch("The Zumwalt was commissioned on 15 October 2016.") });
    const out = await p.research(INPUT);
    expect(out.modelVersion).toBe("@cf/google/gemma-4-26b-a4b-it");
    expect(out.providerName).toBe("workers-ai");
    expect(out.queries).toEqual(["zumwalt 2016 commissioning"]);
    expect(out.proposals).toEqual([{ url: "https://navy.mil/z", proposedQuote: "commissioned on 15 October 2016", advisorySupport: true }]);
  });

  it("skips hits whose fetch fails: the dead URL never appears in the triage prompt", async () => {
    let triagePrompt = "";
    const ai: AiTextClient = {
      generateText: vi.fn(async (_model: string, prompt: string, _opts) => {
        if (prompt.includes("generate neutral web-search queries")) return JSON.stringify({ queries: ["q"] });
        triagePrompt = prompt; // the triage call
        return JSON.stringify({ proposals: [] });
      }),
    };
    const search: SearchProvider = { search: async () => [{ url: "https://x.gov/live" }, { url: "https://x.gov/dead" }] };
    // live fetches ok; dead fails.
    const fetchSource = async (url: string): Promise<SourceFetchResult> =>
      url === "https://x.gov/dead" ? { ok: false, reason: "http_error" } : { ok: true, text: "live page body" as never };
    const p = new WorkersAiResearchProvider({ ai, search, fetchSource });
    const out = await p.research(INPUT);
    expect(triagePrompt).toContain("https://x.gov/live"); // the live page reached triage
    expect(triagePrompt).not.toContain("https://x.gov/dead"); // the dead URL did NOT
    expect(out.proposals).toEqual([]);
    expect(out.queries).toEqual(["q"]);
  });

  it("returns empty proposals + the full model id when query-gen yields no queries (no search performed)", async () => {
    const ai = scriptedAi(["not json", "still not json"]); // query-gen fails both attempts → []
    const search = { search: vi.fn(async () => []) } as unknown as SearchProvider;
    const p = new WorkersAiResearchProvider({ ai, search, fetchSource: noFetch });
    const out = await p.research(INPUT);
    expect(out.queries).toEqual([]);
    expect(out.proposals).toEqual([]);
    expect((search.search as ReturnType<typeof vi.fn>)).not.toHaveBeenCalled();
    expect(out.modelVersion).toBe("@cf/google/gemma-4-26b-a4b-it");
  });

  it("de-dups a URL shared across two queries: fetchSource is called once for the shared URL", async () => {
    const ai = scriptedAi([JSON.stringify({ queries: ["q1", "q2"] }), JSON.stringify({ proposals: [] })]);
    // Both queries surface the same shared URL; q2 also surfaces a distinct one.
    const search: SearchProvider = {
      search: async (q: string) =>
        q === "q1" ? [{ url: "https://shared.gov/p" }] : [{ url: "https://shared.gov/p" }, { url: "https://other.gov/q" }],
    };
    const fetchSource = vi.fn(async (_url: string): Promise<SourceFetchResult> => ({ ok: true, text: "body" as never }));
    const p = new WorkersAiResearchProvider({ ai, search, fetchSource });
    await p.research(INPUT);
    const fetched = fetchSource.mock.calls.map((c) => c[0]);
    expect(fetched.filter((u) => u === "https://shared.gov/p").length).toBe(1); // de-duped across queries
    expect(fetched).toContain("https://other.gov/q");
  });

  it("reports the exact brave query count it issued in usage (one search call per bound query)", async () => {
    const ai = scriptedAi([
      JSON.stringify({ queries: ["q1", "q2"] }),
      JSON.stringify({ proposals: [] }),
    ]);
    const search: SearchProvider = { search: async () => [] };
    const p = new WorkersAiResearchProvider({ ai, search, fetchSource: noFetch });
    const out = await p.research(INPUT);
    expect(out.usage?.braveQueryCount).toBe(2);
  });

  it("propagates ProviderUnavailableError from the ai client (binding/timeout failure is NOT swallowed)", async () => {
    const ai: AiTextClient = { generateText: vi.fn(async () => { throw new (await import("../../src/research/provider")).ProviderUnavailableError(); }) };
    const search: SearchProvider = { search: async () => [] };
    const p = new WorkersAiResearchProvider({ ai, search, fetchSource: noFetch });
    await expect(p.research(INPUT)).rejects.toBeInstanceOf((await import("../../src/research/provider")).ProviderUnavailableError);
  });

  it("bounds fetch + triage volume: ≤ maxCandidateUrls fetches, prompt within budget, braveQueryCount = searches issued (bug-hunt HIGH)", async () => {
    const { MODEL_CONFIG } = await import("../../src/research/model-config");
    // 8 queries, each returning many distinct hits — far more candidates than the cap allows.
    const eightQueries = Array.from({ length: 8 }, (_, i) => `query ${i}`);
    let generateTextCalls = 0;
    let triagePrompt = "";
    const ai: AiTextClient = {
      generateText: vi.fn(async (_model: string, prompt: string) => {
        generateTextCalls += 1;
        if (generateTextCalls === 1) return JSON.stringify({ queries: eightQueries }); // query-gen
        triagePrompt = prompt; // triage
        return JSON.stringify({ proposals: [] });
      }),
    };
    // Each query yields 10 distinct hits, none overlapping across queries.
    const search = vi.fn(async (q: string): Promise<SearchHit[]> =>
      Array.from({ length: 10 }, (_, j) => ({ url: `https://src.gov/${encodeURIComponent(q)}/${j}` })));
    const fetchSource = vi.fn(async (): Promise<SourceFetchResult> =>
      ({ ok: true, text: "X".repeat(50_000) as never })); // each page far exceeds perPageChars
    const p = new WorkersAiResearchProvider({ ai, search: { search } as SearchProvider, fetchSource });
    const out = await p.research(INPUT);

    // (a) candidate cap: never fetch more than maxCandidateUrls URLs.
    expect(fetchSource.mock.calls.length).toBeLessThanOrEqual(MODEL_CONFIG.maxCandidateUrls);
    // We only issue as many searches as are needed to fill the candidate list, never all 8.
    const searchesIssued = search.mock.calls.length;
    expect(searchesIssued).toBeLessThan(8);
    expect(out.usage?.braveQueryCount).toBe(searchesIssued);
    // perQueryHitCap × searchesIssued is the most candidates we could have collected; cap still wins.
    expect(fetchSource.mock.calls.length).toBeLessThanOrEqual(MODEL_CONFIG.perQueryHitCap * searchesIssued);
    // (b) triage prompt stays under a sane bound: maxTriagePages × perPageChars + a fixed overhead.
    const overhead = 8_000;
    expect(triagePrompt.length).toBeLessThan(MODEL_CONFIG.maxTriagePages * MODEL_CONFIG.perPageChars + overhead);
    expect(out.proposals).toEqual([]);
  });
});
