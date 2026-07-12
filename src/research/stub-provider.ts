// ABOUTME: No-op stub implementation of ResearchProvider for testing and wiring.
// ABOUTME: Returns an empty result; no network calls or LLM invocations.
import type { ResearchInput, ResearchProvider, ProviderResearch } from "./provider";

/** Stub provider that returns an empty, typed result with no proposals. */
export class StubResearchProvider implements ResearchProvider {
  async research(_input: ResearchInput): Promise<ProviderResearch> {
    return { providerName: "stub", modelVersion: "fake-provider/0", proposals: [], queries: [] };
  }
}
