// ABOUTME: DET-2 candidate harness — reads det2-candidates.json, the curated dateline-suppressed
// ABOUTME: "leading dateline + later governed target" sentences cut 2 would re-anchor. Structural validation + currently-suppressed invariant + min-count guard.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { parseArticle } from "../../src/detector/parse";
import { detectStaleClaims } from "../../src/detector/detect";
import type { StaleCandidate } from "../../src/domain/types";

/** The three DET-2 hand-labels (design §4). */
const LABELS = ["genuine-target", "narration", "other"] as const;
type Label = (typeof LABELS)[number];

/**
 * Total curated candidate count — hardcoded so the set cannot be silently
 * emptied to pass a future cut-2 gate (testing-pitfalls §9).
 */
const CANDIDATE_COUNT = 47;

interface Det2Entry {
  fixture: string;
  sentenceSubstring: string;
  datelineYear: number;
  targetYear: number;
  label: Label;
  hasReportingVerb: boolean;
  note: string;
}

const candidates = JSON.parse(
  readFileSync("test/gold/det2-candidates.json", "utf8")
) as Det2Entry[];

/** Build a per-fixture cache of detector candidates (parse + detect once per fixture). */
function buildCandidateCache(
  entries: Det2Entry[]
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

const candidateCache = buildCandidateCache(candidates);

describe("DET-2 candidate set — structural validation", () => {
  it("every entry has all fields, correctly typed and valued", () => {
    for (const entry of candidates) {
      expect(typeof entry.fixture, `fixture must be a string`).toBe("string");
      expect(
        typeof entry.sentenceSubstring,
        `sentenceSubstring must be a string in fixture ${entry.fixture}`
      ).toBe("string");
      expect(
        entry.sentenceSubstring.length > 0,
        `sentenceSubstring must be non-empty in fixture ${entry.fixture}`
      ).toBe(true);
      expect(
        LABELS.includes(entry.label),
        `label "${entry.label}" is not an allowed value in fixture ${entry.fixture}`
      ).toBe(true);
      expect(
        typeof entry.hasReportingVerb,
        `hasReportingVerb must be a boolean in fixture ${entry.fixture}`
      ).toBe("boolean");
      expect(
        typeof entry.datelineYear,
        `datelineYear must be a number in fixture ${entry.fixture}`
      ).toBe("number");
      expect(
        typeof entry.targetYear,
        `targetYear must be a number in fixture ${entry.fixture}`
      ).toBe("number");
      expect(
        entry.targetYear > entry.datelineYear,
        `targetYear (${entry.targetYear}) must be > datelineYear (${entry.datelineYear}) in fixture ${entry.fixture}`
      ).toBe(true);
      expect(
        typeof entry.note === "string" && entry.note.length > 0,
        `note must be a non-empty string in fixture ${entry.fixture}`
      ).toBe(true);
    }
  });

  it("every sentenceSubstring occurs in its fixture's parsed sentence text", () => {
    const parsedCache = new Map<string, string[]>();
    for (const entry of candidates) {
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

  // Currently-suppressed invariant (design §3/§5): these are DET-2 *candidates*
  // precisely because the live detector does NOT flag them today (the leading
  // dateline year is the anchor; suppress.ts Rule 1 fires, losing the later
  // target). If cut 2 ships, this flips to "now flagged"; until then every
  // entry's sentence must be absent from detectStaleClaims output.
  it("the live detector flags none of the candidate sentences today", () => {
    const stillFlagged = candidates.filter(entry =>
      candidateCache
        .get(entry.fixture)!
        .some(cand => cand.sentenceText.includes(entry.sentenceSubstring))
    );
    expect(
      stillFlagged.map(e => `${e.fixture}: ${e.sentenceSubstring}`)
    ).toEqual([]);
  });

  // Min-count composition guard (testing-pitfalls §9): a regression gate over a
  // deletable set is no gate. Pinning the count means a future cut-2 gate cannot
  // be passed by deleting curated candidates — it must legitimately re-anchor.
  it(`set holds at least the curated candidate count (${CANDIDATE_COUNT})`, () => {
    expect(
      candidates.length,
      `DET-2 candidate set has ${candidates.length} entries, below the curated count ${CANDIDATE_COUNT} — entries were deleted, not added`
    ).toBeGreaterThanOrEqual(CANDIDATE_COUNT);
  });

  // --- Single labeled informational log (testing-pitfalls §1 output discipline) ---
  // Reports the curated label distribution; passes unconditionally.
  it("logs curated label distribution (informational)", () => {
    const perLabel: Record<Label, number> = {
      "genuine-target": 0,
      narration: 0,
      other: 0,
    };
    for (const entry of candidates) perLabel[entry.label]++;
    console.log("=== DET-2 candidate set — label distribution ===", {
      perLabel,
      total: candidates.length,
    });
  });
});
