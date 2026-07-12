// ABOUTME: Recall harness — reads recall-set.json and measures the detector's recall.
// ABOUTME: Phase 1: structural validation + reporting (no hard floor — Task 2.2 sets that).
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { parseArticle } from "../../src/detector/parse";
import { detectStaleClaims } from "../../src/detector/detect";
import type { StaleCandidate } from "../../src/domain/types";

/** All valid shapeClass values. */
const SHAPE_CLASSES = [
  "simple",
  "marker-gap",
  "suppression-collateral",
  "inline-year-absent",
  "relative-date",
  "other",
] as const;
type ShapeClass = (typeof SHAPE_CLASSES)[number];

/** shapeClass values allowed for reachable:true entries. */
const REACHABLE_SHAPE_CLASSES: readonly ShapeClass[] = [
  "simple",
  "marker-gap",
  "suppression-collateral",
  "other",
];

/** shapeClass values allowed for reachable:false entries. */
const NOT_REACHABLE_SHAPE_CLASSES: readonly ShapeClass[] = [
  "inline-year-absent",
  "relative-date",
  "other",
];

interface RecallEntry {
  fixture: string;
  sentenceSubstring: string;
  stale: true;
  reachable: boolean;
  expectedYear: number | null;
  shapeClass: ShapeClass;
  note: string;
}

const recallSet = JSON.parse(
  readFileSync("test/gold/recall-set.json", "utf8")
) as RecallEntry[];

/** Build a per-fixture cache of detector candidates (parse + detect once per fixture). */
function buildCandidateCache(
  entries: RecallEntry[]
): Map<string, StaleCandidate[]> {
  const cache = new Map<string, StaleCandidate[]>();
  for (const entry of entries) {
    if (!cache.has(entry.fixture)) {
      const wikitext = readFileSync(`test/fixtures/${entry.fixture}`, "utf8");
      const parsed = parseArticle({
        title: entry.fixture,
        revisionId: 1,
        wikitext,
      });
      cache.set(entry.fixture, detectStaleClaims(parsed, 2026));
    }
  }
  return cache;
}

describe("detector recall harness — structural validation", () => {
  it("recall set has valid structure for every entry", () => {
    for (const entry of recallSet) {
      // All required fields present and correctly typed
      expect(
        typeof entry.fixture,
        `fixture must be a string`
      ).toBe("string");
      expect(
        typeof entry.sentenceSubstring,
        `sentenceSubstring must be a string in fixture ${entry.fixture}`
      ).toBe("string");
      expect(
        entry.stale,
        `stale must be true in fixture ${entry.fixture}`
      ).toBe(true);
      expect(
        typeof entry.reachable,
        `reachable must be boolean in fixture ${entry.fixture}`
      ).toBe("boolean");
      expect(
        SHAPE_CLASSES.includes(entry.shapeClass),
        `shapeClass "${entry.shapeClass}" is not an allowed value in fixture ${entry.fixture}`
      ).toBe(true);
      expect(
        entry.note.length > 0,
        `note must be non-empty in fixture ${entry.fixture}`
      ).toBe(true);

      // sentenceSubstring must be non-empty
      expect(
        entry.sentenceSubstring.length > 0,
        `sentenceSubstring must be non-empty in fixture ${entry.fixture}`
      ).toBe(true);

      // Reachable/shapeClass cross-constraint
      if (entry.reachable) {
        expect(
          REACHABLE_SHAPE_CLASSES.includes(entry.shapeClass),
          `reachable:true entry has disallowed shapeClass "${entry.shapeClass}" in fixture ${entry.fixture}`
        ).toBe(true);
        // expectedYear is allowed to be a number (not null) for reachable entries
      } else {
        expect(
          NOT_REACHABLE_SHAPE_CLASSES.includes(entry.shapeClass),
          `reachable:false entry has disallowed shapeClass "${entry.shapeClass}" in fixture ${entry.fixture}`
        ).toBe(true);
        expect(
          entry.expectedYear,
          `reachable:false entry must have expectedYear === null in fixture ${entry.fixture}`
        ).toBeNull();
      }
    }
  });

  it("recall set sentenceSubstrings all appear in their fixture's parsed sentence text", () => {
    for (const entry of recallSet) {
      const wikitext = readFileSync(`test/fixtures/${entry.fixture}`, "utf8");
      const parsed = parseArticle({
        title: entry.fixture,
        revisionId: 1,
        wikitext,
      });
      const allSentenceTexts = parsed.sections.flatMap(s =>
        s.sentences.map(u => u.text)
      );
      const found = allSentenceTexts.some(t =>
        t.includes(entry.sentenceSubstring)
      );
      expect(
        found,
        `sentenceSubstring not found in parsed sentences of fixture "${entry.fixture}": "${entry.sentenceSubstring}"`
      ).toBe(true);
    }
  });

  it("recall set composition: ≥6 reachable:true and ≥1 reachable:false entries", () => {
    const reachableCount = recallSet.filter(e => e.reachable).length;
    const notReachableCount = recallSet.filter(e => !e.reachable).length;
    expect(
      reachableCount,
      `expected ≥6 reachable:true entries, got ${reachableCount}`
    ).toBeGreaterThanOrEqual(6);
    expect(
      notReachableCount,
      `expected ≥1 reachable:false entries, got ${notReachableCount}`
    ).toBeGreaterThanOrEqual(1);
  });
});

describe("detector recall harness — reporting", () => {
  it("computes and logs recall metrics (passes unconditionally — no hard floor)", () => {
    const cache = buildCandidateCache(recallSet);

    // --- Core metrics ---

    const reachableEntries = recallSet.filter(e => e.reachable);
    const allEntries = recallSet;

    let reachableFlagged = 0;
    let absoluteFlagged = 0;

    for (const entry of allEntries) {
      const cands = cache.get(entry.fixture)!;
      const flagged = cands.some(c =>
        c.sentenceText.includes(entry.sentenceSubstring)
      );
      if (flagged) absoluteFlagged++;
      if (entry.reachable && flagged) reachableFlagged++;
    }

    const reachableRecall = reachableFlagged / reachableEntries.length;
    const absoluteRecall = absoluteFlagged / allEntries.length;

    // --- Precision-on-sample ---
    //
    // For each fixture in the recall set, count all detector flags. A flag is
    // a sample-TP if its sentenceText includes ANY stale entry's substring for
    // that fixture; otherwise it is a sample-FP.
    //
    // CAVEAT (comment required by spec): a counted sample-FP could instead be a
    // genuinely-stale claim the labeler missed — so precision-on-sample is a
    // LOWER BOUND on true precision, not an exact figure.

    const fixtureToEntries = new Map<string, RecallEntry[]>();
    for (const entry of allEntries) {
      const list = fixtureToEntries.get(entry.fixture) ?? [];
      list.push(entry);
      fixtureToEntries.set(entry.fixture, list);
    }

    let sampleTP = 0;
    let sampleFP = 0;

    for (const [fixture, entries] of fixtureToEntries) {
      const cands = cache.get(fixture)!;
      for (const cand of cands) {
        const matchesSomeStaleSentence = entries.some(e =>
          cand.sentenceText.includes(e.sentenceSubstring)
        );
        if (matchesSomeStaleSentence) {
          sampleTP++;
        } else {
          // This flag matches no labeled stale entry for this fixture.
          // Could be a genuine FP, or a stale claim the labeler missed;
          // counted as sample-FP here, so precision-on-sample is a lower bound.
          sampleFP++;
        }
      }
    }

    const precisionOnSample =
      sampleTP + sampleFP > 0 ? sampleTP / (sampleTP + sampleFP) : 1;

    // --- Miss histogram by shapeClass ---

    const missHistogram: Partial<Record<ShapeClass, number>> = {};
    const surprises: Array<{ type: string; entry: RecallEntry }> = [];

    for (const entry of allEntries) {
      const cands = cache.get(entry.fixture)!;
      const flagged = cands.some(c =>
        c.sentenceText.includes(entry.sentenceSubstring)
      );

      if (!flagged) {
        missHistogram[entry.shapeClass] =
          (missHistogram[entry.shapeClass] ?? 0) + 1;

        // Surprise: a `simple` entry that was missed → potential detector bug
        if (entry.shapeClass === "simple") {
          surprises.push({ type: "simple-missed (potential bug)", entry });
        }
      } else {
        // Surprise: a non-simple or non-reachable entry that WAS caught → tag too pessimistic
        if (entry.shapeClass !== "simple" || !entry.reachable) {
          surprises.push({ type: "non-simple-or-non-reachable caught (tag may be too pessimistic)", entry });
        }
      }
    }

    // --- Single labeled output block (testing-pitfalls §1 output discipline) ---

    console.log("=== RECALL HARNESS METRICS ===", {
      reachableRecall: {
        flagged: reachableFlagged,
        total: reachableEntries.length,
        rate: reachableRecall,
      },
      absoluteRecall: {
        flagged: absoluteFlagged,
        total: allEntries.length,
        rate: absoluteRecall,
      },
      precisionOnSample: {
        sampleTP,
        sampleFP,
        rate: precisionOnSample,
        caveat:
          "lower bound — a sample-FP could be a stale claim the labeler missed",
      },
      missHistogramByShapeClass: missHistogram,
      surprises,
    });

    // Sanity: metrics are valid rates in [0,1].
    for (const rate of [reachableRecall, absoluteRecall, precisionOnSample]) {
      expect(Number.isFinite(rate)).toBe(true);
      expect(rate).toBeGreaterThanOrEqual(0);
      expect(rate).toBeLessThanOrEqual(1);
    }
  });

  // --- Durable recall floor (Task 2.2) ---
  //
  // REGRESSION GATE, not a target. After the Phase 2 lexicon expansion the
  // shipped reachable recall is 1.0 (11/11). The floor is set conservatively
  // BELOW that (0.90) so it catches a real regression — a future suppression
  // tweak or marker removal that drops 2+ reachable catches — while tolerating
  // ±1 entry of legitimate re-labeling noise (10/11 = 0.909 still passes).
  //
  // We floor REACHABLE recall only, never absolute recall — absolute is bounded
  // by the deferred inline-year design limit (C1), so it is reported, not gated.
  //
  // To re-baseline (only when the recall SET legitimately changes — entries
  // added/removed): re-run, read the new reachable recall, set the floor a small
  // margin below it, and say so in the commit subject (assertion-rigor rule).
  // Do NOT lower the floor to make an unrelated failing change pass.
  it("reachable recall stays at or above the regression floor (0.90)", () => {
    const cache = buildCandidateCache(recallSet);
    const reachable = recallSet.filter(e => e.reachable);
    const flagged = reachable.filter(e =>
      cache.get(e.fixture)!.some(c => c.sentenceText.includes(e.sentenceSubstring))
    ).length;
    const reachableRecall = flagged / reachable.length;
    expect(
      reachableRecall,
      `reachable recall ${flagged}/${reachable.length} = ${reachableRecall.toFixed(3)} dropped below the 0.90 floor — a recall regression to investigate, not to re-baseline away`
    ).toBeGreaterThanOrEqual(0.9);
  });
});
