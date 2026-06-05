// ABOUTME: Explainable stale-claim scorer — combines temporal risk, marker strength, and suppression.
// ABOUTME: Deterministic and LLM-free; explanations are template-filled strings, never model-authored.
import { MARKER_STRENGTH } from "./markers";
import { suppressionScore } from "./suppress";
import type { ScoreBreakdown } from "../domain/types";

/** Input to the scorer for a single candidate claim. */
export interface ScoreInput {
  sentence: string;
  year: number;
  marker: string;
  asOfYear: number;
}

/** Scored result for a candidate claim, with a numeric breakdown and a human-readable explanation. */
export interface ScoredClaim {
  breakdown: ScoreBreakdown;
  total: number;
  explanation: string;
}

/**
 * Scores a candidate stale claim and produces a deterministic, template-filled explanation.
 *
 * The total is `max(0, temporalRisk + futureTenseConfidence - suppression)` for past years,
 * and `0` for years that are not yet past (year >= asOfYear). The explanation names the year
 * and years-past count so downstream consumers can surface it without re-computing.
 *
 * Invariants:
 * - No network calls, no model calls, no `new Date()` reads. `asOfYear` is the injected reference.
 * - `futureTenseConfidence` defaults to `0` for unknown markers (never NaN).
 * - `total` is always >= 0.
 */
export function scoreClaim(input: ScoreInput): ScoredClaim {
  const { sentence, year, marker, asOfYear } = input;

  const isPast = year < asOfYear;
  const temporalRisk = Math.max(0, asOfYear - year);
  const futureTenseConfidence = MARKER_STRENGTH[marker] ?? 0;
  const suppression = suppressionScore(sentence, year);

  const total = isPast ? Math.max(0, temporalRisk + futureTenseConfidence - suppression) : 0;

  const breakdown: ScoreBreakdown = {
    temporalRisk,
    futureTenseConfidence,
    suppression,
    total,
  };

  let explanation: string;
  if (isPast) {
    const yearsPast = asOfYear - year;
    explanation = `Contains '${marker}' tied to ${year}, now ${yearsPast} ${yearsPast === 1 ? "year" : "years"} past.`;
  } else {
    explanation = `Year ${year} is not yet past as of ${asOfYear}; not flagged as stale.`;
  }

  return { breakdown, total, explanation };
}
