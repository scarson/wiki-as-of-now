// ABOUTME: Deterministic verbatim-quote check — the G8/G15 fabrication backstop. Pure, linear, no regex on untrusted text.
// ABOUTME: Confirms BYTE-PRESENCE in the page's normalized text, NOT rendered visibility (human-open gate, G5, is that backstop).
import { normalizeForVerbatim } from "./normalize";
import type { UntrustedSourceText } from "./source-fetch";

/**
 * Blunt anti-triviality floor — NOT a security property. The deterministic check + the human-open
 * verification gate are the real backstops. Raising this FALSE-DROPS legitimate short factual quotes —
 * notably date anchors like "3 May 2024" (10 code points), the exact stale-claim anchors this product
 * surfaces; lowering it admits near-trivial common-phrase matches. Tuned LOW deliberately. Code points,
 * not UTF-16 units. (Future tuner: this is a coverage-vs-noise knob bounded by the human gate, not a
 * correctness threshold.)
 */
export const MIN_QUOTE_LEN = 8;
/**
 * G16 pointer-not-prose bound: a quote longer than a pointer is a copyright / "basically draft text"
 * smell. Re-validated at the research-packs read path (defense in depth). Code points.
 */
export const MAX_QUOTE_LEN = 300;
export const MAX_PAGE_CHARS = 4_000_000; // hard bound before normalization (linear-time guarantee on untrusted text)

export type QuoteResult = "matched" | "quote_too_short" | "quote_too_long" | "quote_not_found";

export function evaluateQuote(pageText: UntrustedSourceText, quote: string): QuoteResult {
  const q = normalizeForVerbatim(quote);
  if (q.length === 0) return "quote_not_found";
  const qLen = [...q].length;
  if (qLen < MIN_QUOTE_LEN) return "quote_too_short";
  if (qLen > MAX_QUOTE_LEN) return "quote_too_long";
  if (q.includes("\n")) return "quote_not_found"; // spans a block boundary → never matches a single segment
  const raw = pageText as unknown as string;
  const page = normalizeForVerbatim(raw.length > MAX_PAGE_CHARS ? raw.slice(0, MAX_PAGE_CHARS) : raw);
  return page.includes(q) ? "matched" : "quote_not_found";
}
