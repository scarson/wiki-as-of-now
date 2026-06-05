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
    const cache = buildCandidateCache(recallSet);
    for (const entry of recallSet) {
      // Pull all parsed sentences directly (we need parsed sentences, not just candidates)
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
    // Silence unused warning — cache is used by the reporting test
    void cache;
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

    // This test passes unconditionally — no hard recall floor.
    // Task 2.2 sets the floor once the post-lexicon-expansion baseline is known.
    expect(true).toBe(true);
  });
});
