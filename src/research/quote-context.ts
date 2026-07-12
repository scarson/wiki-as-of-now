// ABOUTME: Deterministic surrounding-context slicer for a verified quote — flanking source slices within
// ABOUTME: the quote's normalized paragraph, bounded + word-snapped, for evidence-card disambiguation display.
import { normalizeForVerbatim } from "./normalize";
import { MAX_PAGE_CHARS } from "./verbatim-check";
import type { UntrustedSourceText } from "./source-fetch";

/**
 * Max code points of context per side. Tunable; NOT a correctness threshold — the window stays a
 * contiguous in-paragraph span at any cap. Kept near the MAX_QUOTE_LEN pointer bound so the stored-source
 * and copy surface stay modest (G16).
 */
export const CONTEXT_SIDE_CAP = 240;

export interface QuoteContext {
  /** Normalized source text immediately before the quote within its paragraph; null at paragraph start. */
  contextBefore: string | null;
  /** Normalized source text immediately after the quote within its paragraph; null at paragraph end. */
  contextAfter: string | null;
}

/**
 * Slice the normalized source text flanking the quote's occurrence — bounded to CONTEXT_SIDE_CAP code
 * points per side, snapped to a whitespace boundary, never crossing the paragraph boundary (\n). Operates
 * in normalized space (the representation evaluateQuote matched against), so the paragraph boundary is
 * exactly \n and the reconstructed window is a contiguous substring of the normalized page. Returns null
 * for an absent side (quote at a paragraph edge) and for a not-found quote (defensive — the caller only
 * invokes this after a confirmed match).
 */
export function sliceQuoteContext(pageText: UntrustedSourceText, quote: string): QuoteContext {
  // SAFE-1: cap before normalizing (parity with evaluateQuote) — keeps the scan linear and bounded
  // on untrusted text. All operations below are O(n): indexOf/lastIndexOf/slice/spread, no regex.
  const raw = pageText as unknown as string;
  const page = normalizeForVerbatim(raw.length > MAX_PAGE_CHARS ? raw.slice(0, MAX_PAGE_CHARS) : raw);
  const q = normalizeForVerbatim(quote);
  if (q.length === 0) return { contextBefore: null, contextAfter: null };

  const qStart = page.indexOf(q); // first occurrence — same basis as evaluateQuote's includes
  if (qStart === -1) return { contextBefore: null, contextAfter: null };
  const qEnd = qStart + q.length;

  const blockStart = page.lastIndexOf("\n", qStart - 1) + 1;   // 0 when there is no preceding \n
  const nextNl = page.indexOf("\n", qEnd);
  const blockEnd = nextNl === -1 ? page.length : nextNl;

  const before = capTrailing(page.slice(blockStart, qStart));
  const after = capLeading(page.slice(qEnd, blockEnd));

  return {
    contextBefore: before.length === 0 ? null : before,
    contextAfter: after.length === 0 ? null : after,
  };
}

/** Keep at most CONTEXT_SIDE_CAP *trailing* code points; if truncated, drop the leading partial word. */
function capTrailing(s: string): string {
  const cps = [...s];
  if (cps.length <= CONTEXT_SIDE_CAP) return s;
  const kept = cps.slice(cps.length - CONTEXT_SIDE_CAP);
  const sp = kept.indexOf(" ");
  if (sp === -1) return "";              // single oversized token: no clean word boundary
  return kept.slice(sp + 1).join("");    // start just after the first whole space
}

/** Keep at most CONTEXT_SIDE_CAP *leading* code points; if truncated, drop the trailing partial word. */
function capLeading(s: string): string {
  const cps = [...s];
  if (cps.length <= CONTEXT_SIDE_CAP) return s;
  const kept = cps.slice(0, CONTEXT_SIDE_CAP);
  const sp = kept.lastIndexOf(" ");
  if (sp === -1) return "";              // single oversized token
  return kept.slice(0, sp).join("");     // end just before the last whole space
}
