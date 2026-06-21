// ABOUTME: Renders one verified evidence card — verbatim quote in its deterministic source context + real URL + advisory-support flag, ONLY.
// ABOUTME: No children / dangerouslySetInnerHTML path; flanking context is plain source text in spans; structurally cannot surface model-authored prose (G1, DESIGN.md §5).
import type { EvidenceCardView } from "@/worksheet/view-types";

/** Shelf Gray surface, hairline border, ~8px radius. Quote emphasized in serif italic inside de-emphasized source context; source line in mono iron-gall (DESIGN.md §5). */
export function EvidenceCard({ card }: { card: EvidenceCardView }) {
  return (
    <article className="rounded-lg border border-hairline-gray bg-shelf-gray p-4">
      <blockquote className="font-serif text-[0.95rem] leading-relaxed text-body-gray">
        {card.contextBefore && (
          <span className="not-italic text-dust-gray">{card.contextBefore}</span>
        )}
        <strong className="font-medium italic text-body-gray">“{card.verbatimQuote}”</strong>
        {card.contextAfter && (
          <span className="not-italic text-dust-gray">{card.contextAfter}</span>
        )}
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
