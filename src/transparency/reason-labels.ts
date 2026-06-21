// ABOUTME: Human labels for dropped-disposition reason codes — the show-your-work legend (G6/G7).
// ABOUTME: Pure, deterministic, LLM-free; every dropped candidate stays auditable and never renders as a system error.

export type DispositionLane = "evidence";

export interface ReasonLabel {
  label: string;
  lane: DispositionLane;
}

// Verbatim-check reasons (verbatim-check.ts: QuoteResult) plus the SourceFetchFailureReason set
// (source-fetch.ts). DroppedProposal.reason carries these values verbatim (verify-proposal.ts).
const REASON_LABELS: Record<string, string> = {
  // Deterministic verbatim-quote check (verbatim-check.ts).
  quote_not_found: "Quote not found verbatim on the fetched page",
  quote_too_short: "Quote too short to verify (under 8 characters)",
  quote_too_long: "Quote too long to verify (over 300 characters)",
  // Source-fetch failures (source-fetch.ts: SourceFetchFailureReason).
  blocked_scheme: "Source URL used a disallowed scheme",
  blocked_host: "Source URL host blocked by the safe-fetch policy",
  redirect_not_allowed: "Source URL redirected, which is not allowed",
  timeout: "Source page fetch timed out",
  too_large: "Source page exceeded the maximum readable size",
  unsupported_content_type: "Source was not a readable HTML page",
  decode_error: "Source page could not be decoded as text",
  http_error: "Source page returned an HTTP error",
  network_error: "Source page could not be reached",
  empty_after_extraction: "Source page had no readable text after extraction",
};

export const DISPOSITION_REASONS: readonly string[] = Object.keys(REASON_LABELS);

export function labelForReason(reason: string): ReasonLabel {
  const known = REASON_LABELS[reason];
  return {
    label: known ?? "Candidate dropped (reason not recognized)",
    lane: "evidence",
  };
}
