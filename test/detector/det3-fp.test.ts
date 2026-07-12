// ABOUTME: DET-3 false-positive harness — reads det3-fp-set.json, the curated incidental-anchor FPs.
// ABOUTME: Phase 1: structural validation + min-count guard + unconditional baseline reporting (Phase 2 hardens to expect([])).
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { parseArticle } from "../../src/detector/parse";
import { detectStaleClaims } from "../../src/detector/detect";
import type { StaleCandidate } from "../../src/domain/types";

/** The five DET-3 incidental-anchor sub-shapes (design §1/§2). */
const SUB_SHAPES = [
  "cross-clause-aside",
  "noun-modifier",
  "named-entity",
  "parenthetical",
  "range",
] as const;
type SubShape = (typeof SUB_SHAPES)[number];

/** Total curated FP count — hardcoded so the gate cannot be passed by deleting entries (testing-pitfalls §9). */
const CURATED_FP_COUNT = 23;

interface Det3FpEntry {
  fixture: string;
  sentenceSubstring: string;
  anchorYear: number;
  subShape: SubShape;
  stale: false;
  note: string;
}

const fpSet = JSON.parse(
  readFileSync("test/gold/det3-fp-set.json", "utf8")
) as Det3FpEntry[];

/** Build a per-fixture cache of detector candidates (parse + detect once per fixture). */
function buildCandidateCache(
  entries: Det3FpEntry[]
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

const candidateCache = buildCandidateCache(fpSet);

/**
 * The curated entries of a given sub-shape that the CURRENT detector flags
 * (matched by `cand.sentenceText.includes(entry.sentenceSubstring)`). Today this
 * is every entry of that sub-shape — these are the live false positives. Phase 2
 * replaces each sub-shape's baseline log with `expect(flaggedFpEntries(s)).toEqual([])`.
 */
function flaggedFpEntries(subShape: SubShape): Det3FpEntry[] {
  return fpSet.filter(
    entry =>
      entry.subShape === subShape &&
      candidateCache
        .get(entry.fixture)!
        .some(cand => cand.sentenceText.includes(entry.sentenceSubstring))
  );
}

describe("DET-3 FP set — structural validation", () => {
  it("every entry has all fields, correctly typed and valued", () => {
    for (const entry of fpSet) {
      expect(
        typeof entry.fixture,
        `fixture must be a string`
      ).toBe("string");
      expect(
        typeof entry.sentenceSubstring,
        `sentenceSubstring must be a string in fixture ${entry.fixture}`
      ).toBe("string");
      expect(
        entry.sentenceSubstring.length > 0,
        `sentenceSubstring must be non-empty in fixture ${entry.fixture}`
      ).toBe(true);
      expect(
        typeof entry.anchorYear,
        `anchorYear must be a number in fixture ${entry.fixture}`
      ).toBe("number");
      expect(
        SUB_SHAPES.includes(entry.subShape),
        `subShape "${entry.subShape}" is not an allowed value in fixture ${entry.fixture}`
      ).toBe(true);
      expect(
        entry.stale,
        `stale must be false in fixture ${entry.fixture}`
      ).toBe(false);
      expect(
        typeof entry.note === "string" && entry.note.length > 0,
        `note must be a non-empty string in fixture ${entry.fixture}`
      ).toBe(true);
    }
  });

  it("every sentenceSubstring occurs in its fixture's parsed sentence text", () => {
    const parsedCache = new Map<string, string[]>();
    for (const entry of fpSet) {
      if (!parsedCache.has(entry.fixture)) {
        const wikitext = readFileSync(
          `test/fixtures/${entry.fixture}`,
          "utf8"
        );
        const parsed = parseArticle({
          title: entry.fixture,
          revisionId: 1,
          wikitext,
        });
        parsedCache.set(
          entry.fixture,
          parsed.sections.flatMap(s => s.sentences.map(u => u.text))
        );
      }
      const found = parsedCache
        .get(entry.fixture)!
        .some(t => t.includes(entry.sentenceSubstring));
      expect(
        found,
        `sentenceSubstring not found in parsed sentences of fixture "${entry.fixture}": "${entry.sentenceSubstring}"`
      ).toBe(true);
    }
  });

  // Min-count composition guard (testing-pitfalls §9): a regression gate over a
  // deletable set is no gate. Pinning the count means a future edit cannot pass a
  // (Phase 2) FP gate by deleting curated entries — it must legitimately suppress.
  it(`set holds at least the curated FP count (${CURATED_FP_COUNT})`, () => {
    expect(
      fpSet.length,
      `DET-3 FP set has ${fpSet.length} entries, below the curated count ${CURATED_FP_COUNT} — entries were deleted, not suppressed`
    ).toBeGreaterThanOrEqual(CURATED_FP_COUNT);
  });
});

describe("DET-3 FP gate — all five sub-shapes hardened (Task 2.5 completes Phase 2)", () => {
  // The cross-clause discriminator (Task 2.2): the detector must flag NONE of the
  // curated cross-clause asides.
  it("flags none of the cross-clause-aside FPs", () => {
    expect(flaggedFpEntries("cross-clause-aside")).toEqual([]);
  });

  // The noun-modifier discriminator (Task 2.3): the detector must flag NONE of the
  // curated "the <year> <noun>" / possessive-led label FPs.
  it("flags none of the noun-modifier FPs", () => {
    expect(flaggedFpEntries("noun-modifier")).toEqual([]);
  });

  // The named-entity discriminator (Task 2.4): the detector must flag NONE of the
  // curated "<ProperNoun> <year>" entity-name FPs.
  it("flags none of the named-entity FPs", () => {
    expect(flaggedFpEntries("named-entity")).toEqual([]);
  });

  // The parenthetical discriminator (Task 2.5): the detector must flag NONE of the
  // curated "(year)" / "(in year prices)" / "(as of date year)" parenthetical FPs.
  it("flags none of the parenthetical FPs", () => {
    expect(flaggedFpEntries("parenthetical")).toEqual([]);
  });

  // The range discriminator (Task 2.5): the detector must flag NONE of the curated
  // "from year to year" / "between year and year" range FPs.
  it("flags none of the range FPs", () => {
    expect(flaggedFpEntries("range")).toEqual([]);
  });

  // --- Single labeled informational log (testing-pitfalls §1 output discipline) ---
  // Reports the curated distribution; passes unconditionally.
  it("logs curated sub-shape distribution (informational)", () => {
    const curatedPerSubShape: Record<SubShape, number> = {
      "cross-clause-aside": 0,
      "noun-modifier": 0,
      "named-entity": 0,
      parenthetical: 0,
      range: 0,
    };
    for (const entry of fpSet) curatedPerSubShape[entry.subShape]++;
    console.log("=== DET-3 FP GATE — all sub-shapes hardened (Phase 2 complete) ===", {
      curatedPerSubShape,
      totalCurated: fpSet.length,
    });
  });
});
