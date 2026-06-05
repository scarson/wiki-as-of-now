// ABOUTME: Year-eligibility filter — returns the past years a forward marker grammatically governs.
// ABOUTME: Deterministic and LLM-free; drops incidental years (side-clause asides, noun/label/range years).

/** A 4-digit year with its character span in the sentence. */
export interface YearOccurrence {
  value: number;
  start: number;
  end: number;
}

const YEAR_PATTERN = /\b(?:19\d\d|20\d\d)\b/g;

/** Finds every 4-digit year (1900–2099) with its character offsets, in appearance order. */
export function yearOccurrences(sentence: string): YearOccurrence[] {
  const out: YearOccurrence[] = [];
  YEAR_PATTERN.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = YEAR_PATTERN.exec(sentence)) !== null) {
    out.push({ value: Number(m[0]), start: m.index, end: m.index + m[0].length });
  }
  return out;
}

/**
 * Returns the subset of `pastYears` that `marker` grammatically governs — the
 * anchorable target years. Incidental years are dropped (design §2). A leading
 * sentence-initial dateline year is intentionally KEPT eligible (deferred to
 * suppress.ts Rule 1; design §2.2) so this stays a DET-3-only precision change.
 */
export function governedYears(sentence: string, marker: string, pastYears: number[]): number[] {
  const markerIndex = markerPosition(sentence, marker);
  const past = new Set(pastYears);
  const eligible = yearOccurrences(sentence).filter(
    occ => past.has(occ.value) && !isIncidental(sentence, markerIndex, occ)
  );
  return [...new Set(eligible.map(o => o.value))];
}

/**
 * Word-boundary character offset of `marker` in `sentence` (case-insensitive),
 * or -1. Word-boundary-matched to stay consistent with findExpectationMarkers —
 * a plain indexOf would match "will" inside "willing" and misplace the marker.
 */
function markerPosition(sentence: string, marker: string): number {
  const escaped = marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const m = new RegExp(`\\b${escaped}\\b`, "i").exec(sentence);
  return m ? m.index : -1;
}

/** Composes the role discriminators. Built up across Phase 2; identity for now. */
function isIncidental(_sentence: string, _markerIndex: number, _occ: YearOccurrence): boolean {
  return false;
}
