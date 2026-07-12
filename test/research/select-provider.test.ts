// ABOUTME: Tests the env-gated ResearchProvider selection — default stays on stub (CC-7), workers-ai flag flips to real.
// ABOUTME: Both flag states tested so the existing workers stub test stays on the stub path and real selection works.
import { describe, it, expect, vi } from "vitest";
import { selectResearchProvider } from "../../src/research/select-provider";
import { StubResearchProvider } from "../../src/research/stub-provider";
import { WorkersAiResearchProvider } from "../../src/research/workers-ai-provider";
import { ProviderUnavailableError } from "../../src/research/provider";
import { FixtureSearchProvider } from "../../src/research/fixture-search";
import type { SearchProvider } from "../../src/research/search-provider";

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
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const ai = { run: async () => ({ response: JSON.stringify({ queries: ["q"] }) }) };
    const p = selectResearchProvider({ AI: ai as never, RESEARCH_PROVIDER: "workers-ai", fetchSource });
    expect(p).toBeInstanceOf(WorkersAiResearchProvider);
    await expect(p.research(INPUT)).rejects.toBeInstanceOf(ProviderUnavailableError);
    expect(warn).toHaveBeenCalledWith("research.search.failed", { status: "no_backend" });
    warn.mockRestore();
  });
  it("workers-ai with no key but an explicit search override uses the override (dev/Miniflare fixture path)", () => {
    const p = selectResearchProvider({
      AI: fakeAi as never, RESEARCH_PROVIDER: "workers-ai", fetchSource,
      searchOverride: new FixtureSearchProvider({}),
    });
    expect(p).toBeInstanceOf(WorkersAiResearchProvider);
  });
  it("applies circular-source exclusion to the selected search backend — a Wikipedia hit never reaches fetch (WP:CIRCULAR)", async () => {
    const fetched: string[] = [];
    const recordingFetch = async (url: string) => { fetched.push(url); return { ok: false as const, reason: "network_error" as const }; };
    let call = 0;
    const ai = { run: async () => { call += 1; return { response: call === 1 ? JSON.stringify({ queries: ["q"] }) : JSON.stringify({ proposals: [] }) }; } };
    const searchOverride: SearchProvider = {
      search: async () => [{ url: "https://en.wikipedia.org/wiki/X" }, { url: "https://www.britannica.com/Y" }],
    };
    const p = selectResearchProvider({ AI: ai as never, RESEARCH_PROVIDER: "workers-ai", fetchSource: recordingFetch, searchOverride });
    await p.research(INPUT);
    expect(fetched).toContain("https://www.britannica.com/Y");
    expect(fetched).not.toContain("https://en.wikipedia.org/wiki/X");
  });
});
