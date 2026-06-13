// ABOUTME: Tests the env-gated ResearchProvider selection — default stays on stub (CC-7), workers-ai flag flips to real.
// ABOUTME: Both flag states tested so the existing workers stub test stays on the stub path and real selection works.
import { describe, it, expect } from "vitest";
import { selectResearchProvider } from "../../src/research/select-provider";
import { StubResearchProvider } from "../../src/research/stub-provider";
import { WorkersAiResearchProvider } from "../../src/research/workers-ai-provider";

const fakeAi = { run: async () => ({ response: "{}" }) };
const fetchSource = async () => ({ ok: false as const, reason: "network_error" as const });

describe("selectResearchProvider", () => {
  it("defaults to the stub when RESEARCH_PROVIDER is unset (keeps the existing workers stub test green, CC-7)", () => {
    const p = selectResearchProvider({ AI: fakeAi as never, fetchSource });
    expect(p).toBeInstanceOf(StubResearchProvider);
  });
  it("selects the workers-ai provider when RESEARCH_PROVIDER=workers-ai", () => {
    const p = selectResearchProvider({ AI: fakeAi as never, RESEARCH_PROVIDER: "workers-ai", BRAVE_API_KEY: "k", fetchSource });
    expect(p).toBeInstanceOf(WorkersAiResearchProvider);
  });
  it("selects the workers-ai provider with the fixture search when no BRAVE_API_KEY is present", () => {
    const p = selectResearchProvider({ AI: fakeAi as never, RESEARCH_PROVIDER: "workers-ai", fetchSource });
    expect(p).toBeInstanceOf(WorkersAiResearchProvider);
  });
});
