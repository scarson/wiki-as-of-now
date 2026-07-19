// ABOUTME: Types defining the research provider contract — provider PROPOSES, the pipeline VERIFIES.
// ABOUTME: ResearchProvider is the swappable seam; the deterministic verify step lives outside it.

/** Input to a research query — the claim to investigate. */
export interface ResearchInput {
  claimText: string;        // the candidate's sentence_text
  sectionHeading: string;
  year: number;
  /** The article's title — resolves pronoun/definite-article claim subjects ("the Authority…"). */
  articleTitle?: string;
  /** The claim's contiguous section passage (detection-time capture); absent for pre-capture candidate rows. */
  surroundingText?: string;
  sourceRevisionId: number;
}

/** Unverified LLM output: a proposed source URL + the quote the model claims is on it. */
export interface ProposedEvidence {
  url: string;
  proposedQuote: string;
  /** Advisory guess: whether the quote states the claim's current status (see EvidenceCard.advisorySupport). */
  advisorySupport: boolean;
}

/**
 * Post-verification artifact: the RAW quote, confirmed present on the page by the
 * deterministic check.
 *
 * Per the bounded-LLM-role guardrail (the LLM's role is boxed to three jobs)
 * and the no-machine-written-text guardrail in
 * docs/policy/wikipedia-genai-compliance.md: an EvidenceCard carries only a
 * real resolving `url`, a `verbatimQuote` actually present on that page
 * (checked deterministically), and an advisory `advisorySupport` flag —
 * NEVER model-authored prose. Any model phrasing of "the fact" is disposable
 * navigation that must never persist into this card.
 */
export interface EvidenceCard {
  /** A real, resolving URL to the source page. */
  url: string;
  /** A verbatim quote from the source page — deterministically verified as present. */
  verbatimQuote: string;
  /**
   * Advisory flag: whether the quote appears to STATE THE CLAIM'S CURRENT STATUS — what has happened
   * to the dated expectation since its anchor year (occurred / rescheduled / cancelled / superseded /
   * explicitly still pending). Related-but-nonresolving quotes (background on the program, same-timeframe
   * expectation restatements) carry false. Advisory only — the human adjudicates support by opening the
   * source (support-checking guardrail G8).
   */
  advisorySupport: boolean;
  /** Deterministic source text immediately before the quote in its paragraph; null at paragraph start. NOT model prose. */
  contextBefore: string | null;
  /** Deterministic source text immediately after the quote in its paragraph; null at paragraph end. NOT model prose. */
  contextAfter: string | null;
}

/** Best-effort metered-spend figures the provider can surface (optional; threaded to quota_ledger in Phase 5). */
export interface ProviderUsage {
  /** Number of upstream search calls actually issued — exact, the honest metered unit we always have. */
  braveQueryCount?: number;
  /** Per-run Workers AI neurons, when env.AI surfaces a usage figure; left undefined (never fabricated) otherwise. */
  neurons?: number;
}

/** What a provider returns: proposals (unverified) + the neutral queries it used (G9) + model identity (G12). */
export interface ProviderResearch {
  providerName: string;
  modelVersion: string;     // full model identifier for G12 disclosure; fake → "fake-provider/0"
  proposals: ProposedEvidence[];
  queries: string[];
  /** OPTIONAL metered-spend figures (Phase 5 quota_ledger source). Optional so every existing caller still typechecks. */
  usage?: ProviderUsage;
}

/** Thrown when the provider backend is unreachable (caught by the pipeline → status: provider_unavailable). */
export class ProviderUnavailableError extends Error {
  constructor(message = "research provider unavailable") {
    super(message);
    this.name = "ProviderUnavailableError";
  }
}

/** Boundary interface for all research provider implementations. */
export interface ResearchProvider {
  research(input: ResearchInput): Promise<ProviderResearch>;
}
