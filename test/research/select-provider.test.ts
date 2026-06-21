// ABOUTME: Tests the env-gated ResearchProvider selection — default stays on stub (CC-7), workers-ai flag flips to real.
// ABOUTME: Both flag states tested so the existing workers stub test stays on the stub path and real selection works.
import { describe, it, expect } from "vitest";
import { selectResearchProvider } from "../../src/research/select-provider";
import { StubResearchProvider } from "../../src/research/stub-provider";
import { WorkersAiResearchProvider } from "../../src/research/workers-ai-provider";
import { ProviderUnavailableError } from "../../src/research/provider";
import { FixtureSearchProvider } from "../../src/research/fixture-search";

const fakeAi = { run: async () => ({ response: "{}" }) };
const fetchSource = async () => ({ ok: false as const, reason: "network_error" as const });

const INPUT = { claimText: "c", sectionHeading: "s", year: 2025, sourceRevisionId: 1 };

describe("selectResearchProvider", () => {
  it("defaults to the stub when RESEARCH_PROVIDER is unset (keeps the existing workers stub test green, CC-7)", () => {
    const p = selectResearchProvider({ AI: fakeAi as never, fetchSource });
    expect(p).toBeInstanceOf(StubResearchProvider);
  });
  it("selects the workers-ai provider when RESEARCH_PROVIDER=workers-ai", () => {
    const p = selectResearchProvider({ AI: fakeAi as never, RESEARCH_PROVIDER: "workers-ai", BRAVE_API_KEY: "k", fetchSource });
    expect(p).toBeInstanceOf(WorkersAiResearchProvider);
  });
  it("workers-ai with no key and no search override yields a provider whose research() throws ProviderUnavailableError (no terminal no_proposals pack)", async () => {
    // An AI that yields one valid query so research() reaches the (missing) search backend.
    const ai = { run: async () => ({ response: JSON.stringify({ queries: ["q"] }) }) };
    const p = selectResearchProvider({ AI: ai as never, RESEARCH_PROVIDER: "workers-ai", fetchSource });
    expect(p).toBeInstanceOf(WorkersAiResearchProvider);
    await expect(p.research(INPUT)).rejects.toBeInstanceOf(ProviderUnavailableError);
  });
  it("workers-ai with no key but an explicit search override uses the override (dev/Miniflare fixture path)", () => {
    const p = selectResearchProvider({
      AI: fakeAi as never, RESEARCH_PROVIDER: "workers-ai", fetchSource,
      searchOverride: new FixtureSearchProvider({}),
    });
    expect(p).toBeInstanceOf(WorkersAiResearchProvider);
  });
});
