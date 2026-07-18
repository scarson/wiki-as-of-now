// ABOUTME: Tests for the detectStaleClaims orchestrator — verifies year-gate logic, sorting, and purity.
// ABOUTME: Covers past-year flagging, future-year exclusion, section-clause formatting, and determinism.
import { describe, it, expect } from "vitest";
import { detectStaleClaims, DETECTOR_VERSION } from "../../src/detector/detect";
import { parseArticle } from "../../src/detector/parse";

describe("detectStaleClaims", () => {
  it("flags a past-year expectation claim and ignores a future-year one", () => {
    // The 2030 sentence HAS a real marker ("is expected to") but a future year, so it must
    // be excluded by the year gate — not merely for lacking a marker.
    const wikitext = `== Procurement ==\nThe Navy plans to award a contract in 2017.\nA follow-on contract is expected to be awarded in 2030.`;
    const article = parseArticle({ title: "T", revisionId: 1, wikitext });
    const out = detectStaleClaims(article, 2026);
    const years = out.map(c => c.year);
    expect(years).toContain(2017);
    expect(years).not.toContain(2030);
    expect(out[0].explanation.length).toBeGreaterThan(0);
  });
  it("is pure: no network, deterministic across runs", () => {
    const wikitext = `== S ==\nplans to launch in 2015.`;
    const a = parseArticle({ title: "T", revisionId: 1, wikitext });
    expect(detectStaleClaims(a, 2026)).toEqual(detectStaleClaims(a, 2026));
  });
  it("exposes a detector version", () => {
    expect(DETECTOR_VERSION).toBe("1.0.0");
  });
  it("picks the strongest marker and the earliest past year in a sentence", () => {
    // "aims to" (strength 1) and "plans to" (strength 2) both present; two past years.
    const wikitext = `== S ==\nThe program aims to expand and plans to deliver in 2020 and again in 2015.`;
    const out = detectStaleClaims(parseArticle({ title: "T", revisionId: 1, wikitext }), 2026);
    expect(out).toHaveLength(1);
    expect(out[0].marker).toBe("plans to"); // strongest marker chosen
    expect(out[0].year).toBe(2015); // earliest past year = highest temporal risk
  });
  it("sorts candidates by score descending", () => {
    const wikitext = `== S ==\nThe Navy plans to act in 2024.\nThe Navy plans to act in 2015.`;
    const out = detectStaleClaims(parseArticle({ title: "T", revisionId: 1, wikitext }), 2026);
    expect(out.map(c => c.year)).toEqual([2015, 2024]); // 2015 (risk 11) before 2024 (risk 2)
    expect(out[0].score.total).toBeGreaterThanOrEqual(out[1].score.total);
  });
  it("labels a lead-section claim 'in the lead' and a headed one by its section", () => {
    const lead = detectStaleClaims(
      parseArticle({ title: "T", revisionId: 1, wikitext: `The Navy plans to launch in 2015.` }), 2026);
    expect(lead[0].sectionHeading).toBe("");
    expect(lead[0].explanation).toContain("Appears in the lead.");
    const headed = detectStaleClaims(
      parseArticle({ title: "T", revisionId: 1, wikitext: `== Procurement ==\nThe Navy plans to launch in 2015.` }), 2026);
    expect(headed[0].explanation).toContain("Appears in section 'Procurement'.");
  });
  it("drops a suppressed candidate so only the live claim survives", () => {
    // First sentence is historical dateline narration (suppressed); second is a live claim.
    const wikitext = `== S ==\nIn 2015, the Navy plans to invade.\nThe Navy plans to win in 2016.`;
    const out = detectStaleClaims(parseArticle({ title: "T", revisionId: 1, wikitext }), 2026);
    const years = out.map(c => c.year);
    expect(years).toContain(2016);
    expect(years).not.toContain(2015); // suppressed historical dateline dropped (total 0)
  });
  it("records the section and sentence index of each candidate", () => {
    const wikitext = `Lead with no claim.\n\n== S1 ==\nNothing here.\n\n== S2 ==\nFiller.\nThe Navy plans to act in 2015.`;
    const out = detectStaleClaims(parseArticle({ title: "T", revisionId: 1, wikitext }), 2026);
    expect(out).toHaveLength(1);
    expect(out[0].sectionHeading).toBe("S2");
    expect(out[0].sectionIndex).toBe(2); // lead=0, S1=1, S2=2
    expect(out[0].sentenceIndex).toBe(1); // "Filler." is 0, the claim is 1
  });
  it("returns an empty array for an article with no expectation claims", () => {
    const wikitext = `== S ==\nThe radar remains stationed at the site. It was delivered.`;
    expect(detectStaleClaims(parseArticle({ title: "T", revisionId: 1, wikitext }), 2026)).toEqual([]);
  });

  it("captures surroundingText as the claim passage with one adjacent sentence on each side", () => {
    const wikitext = `== Construction ==\nThe Three Gorges Dam spans the Yangtze River. The dam was expected to reach full capacity in 2009. Its final generator entered service later.`;
    const out = detectStaleClaims(parseArticle({ title: "T", revisionId: 1, wikitext }), 2026);
    expect(out).toHaveLength(1);
    expect(out[0].surroundingText).toBe(
      "The Three Gorges Dam spans the Yangtze River. The dam was expected to reach full capacity in 2009. Its final generator entered service later.",
    );
  });
  it("captures a one-sided passage when the claim opens or closes its section", () => {
    const first = detectStaleClaims(
      parseArticle({ title: "T", revisionId: 1, wikitext: `== S ==\nThe Navy plans to act in 2015. A second batch followed.` }),
      2026,
    );
    expect(first[0].surroundingText).toBe("The Navy plans to act in 2015. A second batch followed.");
    const last = detectStaleClaims(
      parseArticle({ title: "T", revisionId: 1, wikitext: `== S ==\nFunding was approved earlier. The Navy plans to act in 2015.` }),
      2026,
    );
    expect(last[0].surroundingText).toBe("Funding was approved earlier. The Navy plans to act in 2015.");
  });
  it("captures null surroundingText when the claim is its section's only sentence", () => {
    const out = detectStaleClaims(
      parseArticle({ title: "T", revisionId: 1, wikitext: `== S ==\nThe Navy plans to act in 2015.` }),
      2026,
    );
    expect(out[0].surroundingText).toBeNull();
  });
  it("omits an oversized neighbor sentence from surroundingText (queue-transport bound)", () => {
    // A pathological giant neighbor must not balloon the passage copied onto every ResearchMessage.
    const giant = `The list includes ${"item, ".repeat(400)}and more.`; // > 1000 code points
    const wikitext = `== S ==\n${giant}\nThe Navy plans to act in 2015. A second batch followed.`;
    const out = detectStaleClaims(parseArticle({ title: "T", revisionId: 1, wikitext }), 2026);
    expect(out).toHaveLength(1);
    expect(out[0].surroundingText).toBe("The Navy plans to act in 2015. A second batch followed.");
  });
  it("captures null surroundingText when the only neighbor is oversized", () => {
    const giant = `The list includes ${"item, ".repeat(400)}and more.`;
    const wikitext = `== S ==\n${giant}\nThe Navy plans to act in 2015.`;
    const out = detectStaleClaims(parseArticle({ title: "T", revisionId: 1, wikitext }), 2026);
    expect(out).toHaveLength(1);
    expect(out[0].surroundingText).toBeNull();
  });
  it("does not cross section boundaries when building surroundingText", () => {
    const wikitext = `== S1 ==\nUnrelated prior section text.\n\n== S2 ==\nThe Navy plans to act in 2015.\n\n== S3 ==\nUnrelated later section text.`;
    const out = detectStaleClaims(parseArticle({ title: "T", revisionId: 1, wikitext }), 2026);
    expect(out).toHaveLength(1);
    expect(out[0].surroundingText).toBeNull(); // only sentence in its own section — neighbors in S1/S3 excluded
  });

  // Gap 2 — line 60: a later marker (higher strength) causes chosenMarker to be reassigned.
  // "aims to" appears before "to be completed by" in the lexicon (both present in the sentence),
  // so markers[0]="aims to" (strength 1) and markers[1]="to be completed by" (strength 2).
  // Line 60 fires: chosenMarker is reassigned to the stronger later marker.
  it("reassigns to a later marker when it has higher strength than the first found (line 60 branch)", () => {
    // "aims to" (strength 1) is lexicon-index 10; "to be completed by" (strength 2) is lexicon-index 12.
    // Both appear in the sentence, so markers = ["aims to", "to be completed by"] — the later one wins.
    const wikitext = `== S ==\nThe project aims to improve quality and is to be completed by 2019.`;
    const out = detectStaleClaims(parseArticle({ title: "T", revisionId: 1, wikitext }), 2026);
    expect(out).toHaveLength(1);
    expect(out[0].marker).toBe("to be completed by"); // the stronger later marker is chosen
    expect(out[0].year).toBe(2019);
  });
});

// detect.ts line 59 — UNREACHABLE/SKIPPED branches: (MARKER_STRENGTH[markers[i]] ?? 0)
// The two `?? 0` fallbacks fire only when a marker key is absent from MARKER_STRENGTH.
// findExpectationMarkers() exclusively returns keys from MARKER_STRENGTH, so both ?? 0
// operands are always defined. The fallback is defensive TypeScript — faking an out-of-lexicon
// marker just to hit the ?? branch would test mocked behavior, not real detection logic.
// Coverage gap accepted; the defensive guard is correct and should remain.
