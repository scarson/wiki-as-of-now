// ABOUTME: Tests for the pure fail-closed safe-lane eligibility gate (src/safelane/eligibility.ts).
// ABOUTME: Covers each floor + advisory branch, canonical reason ordering, and the injected-now freshness check.
import { describe, it, expect } from "vitest";
import { evaluateEligibility, GATE_VERSION, FRESHNESS_WINDOW_MS } from "../../src/safelane/eligibility";
import type { ArticleMetadata } from "../../src/domain/types";

const NOW = new Date("2026-06-06T00:00:00.000Z");
const OLD = "2026-06-01T00:00:00.000Z"; // 5 days old — outside freshness window

function meta(over: Partial<ArticleMetadata> = {}): ArticleMetadata {
  return {
    resolvedPageId: 1,
    resolvedTitle: "X",
    revisionId: 10,
    revisionTimestamp: OLD,
    namespace: 0,
    blpProbe: "absent",
    wikitext: "A clean sentence. [[Category:Spacecraft]]",
    fetchedAt: NOW.toISOString(),
    ...over,
  };
}
const ev = (m: ArticleMetadata) => evaluateEligibility(m, NOW, GATE_VERSION);

describe("evaluateEligibility", () => {
  it("easy_win when every check passes", () => {
    expect(ev(meta())).toEqual({ eligibility: "easy_win", reasons: [] });
  });
  it("blp_category when the probe is present (the hard floor)", () => {
    expect(ev(meta({ blpProbe: "present" }))).toEqual({ eligibility: "human_only", reasons: ["blp_category"] });
  });
  it("metadata_unavailable when the probe is unknown (fail-closed)", () => {
    expect(ev(meta({ blpProbe: "unknown" }))).toEqual({ eligibility: "human_only", reasons: ["metadata_unavailable"] });
  });
  it("non_mainspace for namespace != 0", () => {
    expect(ev(meta({ namespace: 1 }))).toEqual({ eligibility: "human_only", reasons: ["non_mainspace"] });
  });
  it("recently_edited when the revision is within the freshness window", () => {
    const fresh = new Date(NOW.getTime() - FRESHNESS_WINDOW_MS + 1000).toISOString();
    expect(ev(meta({ revisionTimestamp: fresh }))).toEqual({ eligibility: "human_only", reasons: ["recently_edited"] });
  });
  it("blp_wikitext (advisory) when wikitext has a literal BLP category", () => {
    expect(ev(meta({ wikitext: "[[Category:Living people]]" }))).toEqual({
      eligibility: "human_only",
      reasons: ["blp_wikitext"],
    });
  });
  it("dispute_template advisory codes", () => {
    expect(ev(meta({ wikitext: "{{POV}}" }))).toEqual({ eligibility: "human_only", reasons: ["dispute_template:POV"] });
  });
  it("emits reasons in canonical order when multiple fire", () => {
    const m = meta({
      namespace: 2,
      blpProbe: "present",
      wikitext: "{{POV}} [[Category:Living people]]",
      revisionTimestamp: new Date(NOW.getTime() - 1000).toISOString(),
    });
    expect(ev(m).reasons).toEqual([
      "non_mainspace",
      "blp_category",
      "recently_edited",
      "blp_wikitext",
      "dispute_template:POV",
    ]);
  });
});
