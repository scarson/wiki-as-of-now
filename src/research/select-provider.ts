// ABOUTME: Env-gated ResearchProvider selection. Default = stub (CC-7: keeps the workers stub test on the stub path).
// ABOUTME: workers-ai + BRAVE_API_KEY → real Brave; workers-ai without a key → real + injected search (dev/Miniflare only).
import { ProviderUnavailableError } from "./provider";
import type { ResearchProvider } from "./provider";
import type { SourceFetchResult } from "./source-fetch";
import type { AiRunner } from "./ai-client";
import type { SearchProvider } from "./search-provider";
import { makeAiTextClient } from "./ai-client";
import { StubResearchProvider } from "./stub-provider";
import { WorkersAiResearchProvider } from "./workers-ai-provider";
import { BraveSearchProvider } from "./brave-search";
import { excludeCircularSources } from "./source-exclusion";

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
  const backend: SearchProvider = env.BRAVE_API_KEY
    ? new BraveSearchProvider(env.BRAVE_API_KEY)
    : (env.searchOverride ?? noSearchBackend());
  // Wikipedia + mirrors can't source Wikipedia (WP:CIRCULAR) — filter every backend, provider-agnostically.
  const search = excludeCircularSources(backend);
  return new WorkersAiResearchProvider({ ai, search, fetchSource: env.fetchSource });
}

/**
 * Used only when neither a Brave key nor a searchOverride is supplied. It THROWS
 * ProviderUnavailableError rather than returning [] so research() routes through the retryable
 * provider_unavailable path and persists nothing: a returned [] would emit a terminal no_proposals
 * pack that, being write-once (ON CONFLICT DO NOTHING + packStore.has short-circuit), would
 * PERMANENTLY block a real retry once a Brave key is added. The manual-URL flow still works upstream.
 */
function noSearchBackend(): SearchProvider {
  return { search: async () => { throw new ProviderUnavailableError("no search backend configured"); } };
}
