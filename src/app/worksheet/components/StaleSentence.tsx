// ABOUTME: Renders a candidate sentence with the signature stale marker — a 2px rust underline + rust text on the stale span.
// ABOUTME: Inline in the Body Gray prose; no background highlight, no box (DESIGN.md §5 Stale Marker, the Two Lanes Rule).
import { splitSentenceAroundMarker } from "@/worksheet/stale-marker";

export function StaleSentence({ sentenceText, marker }: { sentenceText: string; marker: string }) {
  const { before, staleSpan, after } = splitSentenceAroundMarker(sentenceText, marker);
  return (
    <span className="text-body-gray">
      {before}
      {staleSpan && (
        <span className="text-oxidized-rust underline decoration-[var(--oxidized-rust)] decoration-2 underline-offset-2">
          {staleSpan}
        </span>
      )}
      {after}
    </span>
  );
}
