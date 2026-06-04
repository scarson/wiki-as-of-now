// ABOUTME: Types defining the research provider contract for the research layer.
// ABOUTME: ResearchProvider is the seam that keeps the LLM layer swappable and bounded.

/** Input to a research query — the claim to investigate. */
export interface ResearchInput {
  claimText: string;
  sectionHeading: string;
  year: number;
}

/**
 * A single evidence candidate surfaced by a research provider.
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

/** The result returned by a research provider. */
export interface ResearchResult {
  providerName: string;
  candidates: EvidenceCard[];
}

/** Boundary interface for all research provider implementations. */
export interface ResearchProvider {
  research(input: ResearchInput): Promise<ResearchResult>;
}
