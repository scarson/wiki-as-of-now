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
});
