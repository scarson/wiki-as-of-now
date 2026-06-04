// ABOUTME: Precision regression gate — runs the detector over real fixtures and a labeled gold set.
// ABOUTME: Asserts gold-set precision >= 0.9 (precision-over-recall is the design choice).
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { parseArticle } from "../../src/detector/parse";
import { detectStaleClaims } from "../../src/detector/detect";

interface GoldEntry {
  fixture: string;
  sentenceSubstring: string;
  stale: boolean;
  expectedYear?: number;
  note?: string;
}

const gold = JSON.parse(readFileSync("test/gold/gold-set.json", "utf8")) as GoldEntry[];

describe("detector gold-set precision", () => {
  // NOTE: this measures precision over the LABELED gold subset only (does the
  // detector flag the labeled positives and avoid flagging the labeled negatives),
  // NOT true precision over every sentence in the articles. It is a regression
  // gate, not a true-precision metric. Precision over recall is the design choice.
  it("gold-set precision >= 0.9", () => {
    let tp = 0, fp = 0;
    for (const g of gold) {
      const wikitext = readFileSync(`test/fixtures/${g.fixture}`, "utf8");
      const cands = detectStaleClaims(parseArticle({ title: g.fixture, revisionId: 1, wikitext }), 2026);
      const flagged = cands.some(c => c.sentenceText.includes(g.sentenceSubstring));
      if (g.stale && flagged) tp++;
      if (!g.stale && flagged) fp++;
    }
    const precision = tp / (tp + fp || 1);
    expect(precision).toBeGreaterThanOrEqual(0.9);
  });

  // Anti-gaming guard (plan Task 2.7 Step 3 / completion check): precision is
  // trivially 1.0 over a positives-only set, so the gate is only meaningful if
  // the gold set carries real negatives. Lock the composition so a future edit
  // cannot pass the gate by deleting negatives.
  it("gold set has real positives AND real negatives", () => {
    const positives = gold.filter(g => g.stale).length;
    const negatives = gold.filter(g => !g.stale).length;
    expect(positives).toBeGreaterThanOrEqual(3);
    expect(negatives).toBeGreaterThanOrEqual(3);
  });
});
