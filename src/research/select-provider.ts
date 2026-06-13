// ABOUTME: Env-gated ResearchProvider selection. Default = stub (CC-7: keeps the workers stub test on the stub path).
// ABOUTME: workers-ai + BRAVE_API_KEY → real Brave; workers-ai without a key → real + injected search (dev/Miniflare only).
import type { ResearchProvider } from "./provider";
import type { SourceFetchResult } from "./source-fetch";
import type { AiRunner } from "./ai-client";
import type { SearchProvider } from "./search-provider";
import { makeAiTextClient } from "./ai-client";
import { StubResearchProvider } from "./stub-provider";
import { WorkersAiResearchProvider } from "./workers-ai-provider";
import { BraveSearchProvider } from "./brave-search";

export interface ProviderSelectionEnv {
  AI: AiRunner;
  RESEARCH_PROVIDER?: string;
  BRAVE_API_KEY?: string;
  fetchSource: (url: string) => Promise<SourceFetchResult>;
  /** Injected search for the keyless/dev path (avoids importing node:fs into the worker bundle). */
  searchOverride?: SearchProvider;
}

export function selectResearchProvider(env: ProviderSelectionEnv): ResearchProvider {
  if (env.RESEARCH_PROVIDER !== "workers-ai") {
    return new StubResearchProvider(); // default — PK-poison but isolated to the stub path (CC-7)
  }
  const ai = makeAiTextClient(env.AI);
  const search: SearchProvider = env.BRAVE_API_KEY
    ? new BraveSearchProvider(env.BRAVE_API_KEY)
    : (env.searchOverride ?? emptySearch());
  return new WorkersAiResearchProvider({ ai, search, fetchSource: env.fetchSource });
}

/** A no-op search used only when neither a Brave key nor a searchOverride is supplied (manual-URL flow still works upstream). */
function emptySearch(): SearchProvider {
  return { search: async () => [] };
}
