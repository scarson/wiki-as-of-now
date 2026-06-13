// ABOUTME: Renders one verified evidence card — verbatim quote + real URL + advisory-support flag, ONLY.
// ABOUTME: No children / dangerouslySetInnerHTML path; structurally cannot surface model-authored prose (G1, DESIGN.md §5).
import type { EvidenceCardView } from "@/worksheet/view-types";

/** Shelf Gray surface, hairline border, ~8px radius. Quote in serif italic; source line in mono iron-gall (DESIGN.md §5). */
export function EvidenceCard({ card }: { card: EvidenceCardView }) {
  return (
    <article className="rounded-lg border border-hairline-gray bg-shelf-gray p-4">
      <blockquote className="font-serif text-[0.95rem] italic leading-relaxed text-body-gray">
        “{card.verbatimQuote}”
      </blockquote>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <a
          href={card.url}
          target="_blank"
          rel="noopener noreferrer"
          className="font-mono text-xs text-iron-gall underline underline-offset-2 break-all"
        >
          {card.url}
        </a>
        {card.advisorySupport ? (
          <span className="font-mono text-xs text-ledger-olive-bright">✓ appears to support</span>
        ) : (
          <span className="font-mono text-xs text-dust-gray">weak support</span>
        )}
      </div>
    </article>
  );
}
