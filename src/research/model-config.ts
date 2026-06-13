// ABOUTME: Pinned Workers AI model ids + per-call bounds for the research provider — config, not code.
// ABOUTME: Workers AI's deprecation cadence is fast and auto-aliasing can raise prices, so model ids live here (build design §3.3).
export const MODEL_CONFIG = {
  /** FULL model id — surfaced verbatim as ProviderResearch.modelVersion for the mechanical-disclosure guardrail (G12). */
  primaryModel: "@cf/google/gemma-4-26b-a4b-it",
  /** Escalation tier (build design §3.3); general kimi-k2.6, never the code-tuned variant. */
  escalationModel: "@cf/moonshotai/kimi-k2.6",
  /** Explicit — Workers AI per-model defaults vary and silently truncate JSON (build design §3.3). */
  maxTokens: 1024,
  /** Per-message abort budget (build design §3.3: ~25-30s). */
  callTimeoutMs: 28_000,
  /** One retry on malformed/invalid JSON (build design §3.3). */
  jsonRetries: 1,
  /** G9 query bounds — provider self-bounds before send; the pipeline is the authority (pipeline.ts:16-17). */
  maxQueries: 8,
  maxQueryLen: 256,
  /** Mirrors pipeline.ts:14 DEFAULT_MAX_PROPOSALS. */
  maxProposals: 5,
  /**
   * research() fetch + triage volume bounds. Without these, 8 queries × ~20 Brave hits → ~160 fetches,
   * and triage concatenates every full ≤2MB page into one prompt → Gemma context overflow → JSON gate
   * fails → silent [] (a false "no evidence" result). These cap the candidate set, the per-query take,
   * and the per-page text fed to triage so the assembled prompt stays inside the model's context window.
   */
  /** Hard ceiling on de-duped candidate URLs collected (and fetched) across all queries. */
  maxCandidateUrls: 12,
  /** Most hits taken from any one query's results before moving on. */
  perQueryHitCap: 3,
  /** Code points of each page's text fed into the triage prompt (truncated past this). */
  perPageChars: 4000,
  /** Most fetched pages assembled into a single triage prompt. */
  maxTriagePages: 12,
  /** `count` sent to Brave per query — fewer results per call keeps the candidate funnel tight. */
  braveCount: 5,
} as const;
