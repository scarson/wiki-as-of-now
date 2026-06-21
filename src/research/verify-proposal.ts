// ABOUTME: verifyProposal — the standalone compliance seam: fetch a proposed URL, run the deterministic
// ABOUTME: verbatim check, emit a verified EvidenceCard or a typed DroppedProposal (verify lives outside the provider).
import type { EvidenceCard, ProposedEvidence } from "./provider";
import type { SourceFetchResult } from "./source-fetch";
import { evaluateQuote } from "./verbatim-check";
import { sliceQuoteContext } from "./quote-context";

/** A proposal that did not become a verified card, with a reason code (a fetch-failure reason or a quote_* result). */
export interface DroppedProposal {
  url: string;
  reason: string;
}

export async function verifyProposal(
  proposal: ProposedEvidence,
  deps: { fetchSource: (url: string) => Promise<SourceFetchResult> },
): Promise<EvidenceCard | DroppedProposal> {
  const fetched = await deps.fetchSource(proposal.url);
  if (!fetched.ok) {
    return { url: proposal.url, reason: fetched.reason };
  }
  const result = evaluateQuote(fetched.text, proposal.proposedQuote);
  if (result === "matched") {
    // Store the RAW proposed quote (design §3 determinism rule); context is sliced deterministically
    // from the same fetched page (design 2026-06-21 §3.2) — source text, never model prose.
    const { contextBefore, contextAfter } = sliceQuoteContext(fetched.text, proposal.proposedQuote);
    return {
      url: proposal.url,
      verbatimQuote: proposal.proposedQuote,
      advisorySupport: proposal.advisorySupport,
      contextBefore,
      contextAfter,
    };
  }
  return { url: proposal.url, reason: result };
}
