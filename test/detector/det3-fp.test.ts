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

/**
 * The curated entries of a sub-shape that the detector STILL flags, AND whose
 * flagging candidate actually anchors on the curated `anchorYear`. The
 * anchorYear cross-check (Task 1.1 reviewer NIT) stops a wrong anchorYear from
 * passing silently: a sub-shape can only be reported "still flagged" when the
 * detector flags that sentence on the very year the curation claims is incidental.
 */
function flaggedOnAnchorYear(subShape: SubShape): Det3FpEntry[] {
  return fpSet.filter(entry => {
    if (entry.subShape !== subShape) return false;
    const matching = candidateCache
      .get(entry.fixture)!
      .filter(cand => cand.sentenceText.includes(entry.sentenceSubstring));
    return matching.some(c => c.year === entry.anchorYear);
  });
}

describe("DET-3 FP gate — cross-clause hardened, rest baseline-reporting", () => {
  // The cross-clause discriminator (Task 2.2) lands first, so its sub-shape is a
  // HARD gate: the detector must flag NONE of the curated cross-clause asides.
  it("flags none of the cross-clause-aside FPs", () => {
    expect(flaggedFpEntries("cross-clause-aside")).toEqual([]);
  });

  // The remaining sub-shapes still baseline-report (their discriminators land in
  // Tasks 2.3–2.5). Passes unconditionally for now; each line below becomes a hard
  // `expect(flaggedFpEntries("<shape>")).toEqual([])` as its discriminator lands.
  it("logs the per-sub-shape flagged baseline for the not-yet-hardened sub-shapes", () => {
    const stillBaselined: SubShape[] = [
      "noun-modifier",
      "named-entity",
      "parenthetical",
      "range",
    ];

    const baseline: Record<string, number> = {};
    const onAnchor: Record<string, number> = {};
    for (const s of stillBaselined) {
      baseline[s] = flaggedFpEntries(s).length;
      onAnchor[s] = flaggedOnAnchorYear(s).length;
    }

    const curatedPerSubShape: Record<SubShape, number> = {
      "cross-clause-aside": 0,
      "noun-modifier": 0,
      "named-entity": 0,
      parenthetical: 0,
      range: 0,
    };
    for (const entry of fpSet) curatedPerSubShape[entry.subShape]++;

    // --- Single labeled output block (testing-pitfalls §1 output discipline) ---
    console.log("=== DET-3 FP BASELINE (not-yet-hardened sub-shapes) ===", {
      curatedPerSubShape,
      flaggedPerSubShape: baseline,
      flaggedOnAnchorYear: onAnchor,
      crossClauseHardened: flaggedFpEntries("cross-clause-aside").length === 0,
    });

    // Sanity for the not-yet-hardened sub-shapes: every curated entry is still a
    // live FP today AND the detector flags it ON the curated anchorYear — so a
    // wrong anchorYear cannot pass silently before this becomes an expect([]) gate.
    for (const s of stillBaselined) {
      expect(
        baseline[s],
        `sub-shape "${s}": flagged-today ${baseline[s]} != curated ${curatedPerSubShape[s]} — a curated FP is no longer flagged; re-verify before this becomes a Phase 2 expect([]) gate`
      ).toBe(curatedPerSubShape[s]);
      expect(
        onAnchor[s],
        `sub-shape "${s}": flagged-on-anchorYear ${onAnchor[s]} != curated ${curatedPerSubShape[s]} — a curated entry's anchorYear does not match the detector's chosen year; the anchorYear is wrong`
      ).toBe(curatedPerSubShape[s]);
    }
  });
});
