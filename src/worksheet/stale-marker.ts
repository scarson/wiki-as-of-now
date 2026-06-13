// ABOUTME: Splits a candidate sentence around its stale marker for the rust-underline render.
// ABOUTME: Pure, deterministic; first-occurrence match; round-trips (before+span+after === sentence).
export interface MarkerSplit {
  before: string;
  staleSpan: string;
  after: string;
}

export function splitSentenceAroundMarker(sentenceText: string, marker: string): MarkerSplit {
  if (marker.length === 0) {
    return { before: sentenceText, staleSpan: "", after: "" };
  }
  const idx = sentenceText.indexOf(marker);
  if (idx === -1) {
    return { before: sentenceText, staleSpan: "", after: "" };
  }
  return {
    before: sentenceText.slice(0, idx),
    staleSpan: sentenceText.slice(idx, idx + marker.length),
    after: sentenceText.slice(idx + marker.length),
  };
}
