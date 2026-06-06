// ABOUTME: Shared verbatim-normalization contract — imported by the HTML extractor AND the verbatim check
// ABOUTME: so they can never diverge. NFC → strip zero-width → fold visible whitespace (preserve \n) → trim.

// Soft-hyphen (U+00AD) + zero-width family: ZWSP (U+200B), ZWNJ (U+200C), ZWJ (U+200D),
// Word Joiner (U+2060), ZWNBSP/BOM (U+FEFF). All render zero-width; stripping is reader-visible-equivalent.
const ZERO_WIDTH = /[\u00AD\u200B\u200C\u200D\u2060\uFEFF]/g;

// Visible whitespace folded to ONE ASCII space (Unicode Zs category + NEL U+0085 + VT U+000B + FF U+000C + tab),
// EXCLUDING \n (U+000A, the block boundary).
// Unicode Zs: U+0020 U+00A0 U+1680 U+2000-U+200A U+202F U+205F U+3000
// Character-class alternation with + only — linear-time, no catastrophic backtracking (SAFE-1).
const FOLDABLE_WS =
  /[\t\u000B\u000C\u0085\u0020\u00A0\u1680\u2000-\u200A\u202F\u205F\u3000]+/g;

export function normalizeForVerbatim(raw: string): string {
  let s = raw.normalize("NFC");
  s = s.replace(ZERO_WIDTH, "");      // strip (reader-visible-equivalent); never map to space
  s = s.replace(FOLDABLE_WS, " ");    // fold visible-whitespace runs to one ASCII space; \n untouched
  s = s.replace(/ *\n */g, "\n");   // collapse spaces adjacent to \n so segment edges normalize consistently
  return s.trim();
}
