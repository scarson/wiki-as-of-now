// ABOUTME: Shared verbatim-normalization contract — imported by the HTML extractor AND the verbatim check
// ABOUTME: so they can never diverge. NFC -> strip zero-width -> vertical ws to \n / horizontal ws to space -> trim.

const ZERO_WIDTH = /[\u00AD\u200B\u200C\u200D\u2060\uFEFF]/g; // soft-hyphen + zero-width family (render zero-width)
// Vertical whitespace / line+paragraph separators -> the \n block boundary (NOT a space). Mapping these to
// \n (combined with evaluateQuote's \n-in-quote rejection) is the cross-block-forgery defense: folding them
// to a space would let a quote bridge two reader-distinct lines. Covers text/plain too (no HTML extractor runs
// for text/plain, so normalize is the only boundary layer). Set: LF, VT, FF, CR, NEL, LS, PS.
const VERTICAL_WS = /[\n\r\u000B\u000C\u0085\u2028\u2029]+/g;
// Horizontal whitespace (Unicode Zs category + tab) -> one ASCII space. Character-class alternation with +
// only: linear time, no catastrophic backtracking (SAFE-1).
const HORIZONTAL_WS = /[\t\u0020\u00A0\u1680\u2000-\u200A\u202F\u205F\u3000]+/g;

export function normalizeForVerbatim(raw: string): string {
  let s = raw.normalize("NFC");
  s = s.replace(ZERO_WIDTH, "");        // strip (reader-visible-equivalent); never map to space
  s = s.replace(VERTICAL_WS, "\n");     // any run of line/vertical separators -> one \n block boundary
  s = s.replace(HORIZONTAL_WS, " ");    // horizontal whitespace runs -> one ASCII space
  s = s.replace(/ *\n */g, "\n");       // drop spaces adjacent to a \n boundary
  return s.trim();
}
