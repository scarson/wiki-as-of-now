// ABOUTME: Types defining the research provider contract — provider PROPOSES, the pipeline VERIFIES.
// ABOUTME: ResearchProvider is the swappable seam; the deterministic verify step lives outside it.

/** Input to a research query — the claim to investigate. */
export interface ResearchInput {
  claimText: string;        // the candidate's sentence_text
  sectionHeading: string;
  year: number;
  surroundingText?: string; // optional; plumbed at detection time in a later slice
  sourceRevisionId: number;
}

/** Unverified LLM output: a proposed source URL + the quote the model claims is on it. */
export interface ProposedEvidence {
  url: string;
  proposedQuote: string;
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
  /** Advisory flag: whether this card appears to support the claim. Human must verify. */
  advisorySupport: boolean;
}

/** What a provider returns: proposals (unverified) + the neutral queries it used (G9) + model identity (G12). */
export interface ProviderResearch {
  providerName: string;
  modelVersion: string;     // full model identifier for G12 disclosure; fake → "fake-provider/0"
  proposals: ProposedEvidence[];
  queries: string[];
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
