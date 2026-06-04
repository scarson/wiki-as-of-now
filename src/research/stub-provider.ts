// ABOUTME: No-op stub implementation of ResearchProvider for testing and wiring.
// ABOUTME: Returns an empty result; no network calls or LLM invocations.
import type { ResearchInput, ResearchProvider, ResearchResult } from "./provider";

/** Stub provider that returns an empty, typed result with no candidates. */
export class StubResearchProvider implements ResearchProvider {
  async research(_input: ResearchInput): Promise<ResearchResult> {
    return { providerName: "stub", candidates: [] };
  }
}
