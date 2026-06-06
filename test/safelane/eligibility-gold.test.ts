// ABOUTME: Gold-set integration test — frozen raw API envelopes through the real ingest mapper + gate.
// ABOUTME: A composition guard enforces shape coverage (present/absent/unknown/non-mainspace/fresh) so the set can't be gamed.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { mapResponseToMetadata, toArticleMetadata } from "../../src/ingest/wikimedia";
import { evaluateEligibility, GATE_VERSION, FRESHNESS_WINDOW_MS } from "../../src/safelane/eligibility";
import type { ArticleMetadata, EligibilityDecision } from "../../src/domain/types";

// NOTE: this measures the LABELED gold set — a regression gate over frozen envelopes, NOT production
// precision. A deterministic category probe cannot be a perfect BLP (biographies of living persons)
// oracle; the four known residual fail-OPENs are documented in the safe-lane design §9 and the
// compliance change log (2026-06-06), mitigated by the freshness fail-closed + the human-verification gate.

interface GoldEntry {
  name: string;
  rawResponse: Parameters<typeof mapResponseToMetadata>[0];
  expected: EligibilityDecision;
}
interface GoldSet {
  goldNow: string;
  entries: GoldEntry[];
}

const gold = JSON.parse(readFileSync("test/gold/eligibility-set.json", "utf8")) as GoldSet;
const now = new Date(gold.goldNow);

// Map each frozen envelope through the SAME ingest path production uses (parse + rename), so the
// probe/normalization and advisory-scan paths are exercised — never pre-cleaned fields (testing-pitfalls §9).
const mapped: { entry: GoldEntry; meta: ArticleMetadata }[] = gold.entries.map(entry => ({
  entry,
  meta: toArticleMetadata(mapResponseToMetadata(entry.rawResponse, "2026-06-06T00:00:00Z")),
}));

describe("eligibility gold set", () => {
  for (const { entry, meta } of mapped) {
    it(`verdict matches the hand-derived label: ${entry.name}`, () => {
      expect(evaluateEligibility(meta, now, GATE_VERSION)).toEqual(entry.expected);
    });
  }

  it("composition guard: every shape present, and ≥3 human_only AND ≥3 easy_win", () => {
    const probes = mapped.map(m => m.meta.blpProbe);
    expect(probes).toContain("present"); // a BLP-category match (the hard floor)
    expect(probes).toContain("absent"); // a definitively-absent probe
    expect(probes).toContain("unknown"); // an indeterminate probe (fail-closed)
    expect(mapped.some(m => m.meta.namespace !== 0)).toBe(true); // a non-mainspace page
    expect(
      mapped.some(m => now.getTime() - new Date(m.meta.revisionTimestamp).getTime() < FRESHNESS_WINDOW_MS),
    ).toBe(true); // a recently-edited (freshness) case

    const verdicts = mapped.map(m => m.entry.expected.eligibility);
    expect(verdicts.filter(v => v === "human_only").length).toBeGreaterThanOrEqual(3);
    expect(verdicts.filter(v => v === "easy_win").length).toBeGreaterThanOrEqual(3);
  });
});
