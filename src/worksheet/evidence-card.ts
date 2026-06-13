// ABOUTME: Builds the evidence-card render model from a verified EvidenceCard.
// ABOUTME: Projects ONLY url/verbatimQuote/advisorySupport — no slot for model-authored prose (G1).
import type { EvidenceCard } from "../research/provider";
import type { EvidenceCardView } from "./view-types";

export function toEvidenceCardView(card: EvidenceCard): EvidenceCardView {
  // Explicit field projection — never { ...card } — so no extra field can leak into the view.
  return {
    url: card.url,
    verbatimQuote: card.verbatimQuote,
    advisorySupport: card.advisorySupport,
  };
}
