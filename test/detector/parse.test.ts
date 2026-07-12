// ABOUTME: Tests for the article parser that converts wikitext into a ParsedArticle.
// ABOUTME: Verifies section splitting by heading and sentence tokenization within sections.
import { describe, it, expect } from "vitest";
import { parseArticle } from "../../src/detector/parse";

describe("parseArticle", () => {
  it("splits sections by heading and sentences within them", () => {
    const wikitext = `Lead sentence one. Lead two.\n\n== Procurement ==\nThe Navy plans to award a contract in 2017. It was delayed.`;
    const a = parseArticle({ title: "Test", revisionId: 1, wikitext });
    const proc = a.sections.find(s => s.heading === "Procurement")!;
    expect(proc).toBeDefined();
    // substring match, not exact equality: robust to wtf_wikipedia's punctuation/splitting
    expect(proc.sentences.some(s => s.text.includes("plans to award a contract in 2017"))).toBe(true);
  });
  it("returns no sections for empty or whitespace-only wikitext", () => {
    expect(parseArticle({ title: "T", revisionId: 1, wikitext: "" }).sections).toEqual([]);
    expect(parseArticle({ title: "T", revisionId: 1, wikitext: "   \n\n  " }).sections).toEqual([]);
  });
  it("represents the lead as a section with an empty heading", () => {
    const a = parseArticle({ title: "T", revisionId: 1, wikitext: "Just a lead sentence here." });
    expect(a.sections[0].heading).toBe("");
    expect(a.sections[0].sentences.some(s => s.text.includes("lead sentence"))).toBe(true);
  });
  it("trims sentences and drops empty ones", () => {
    const a = parseArticle({ title: "T", revisionId: 1, wikitext: "== S ==\nA real sentence." });
    const s = a.sections.find(x => x.heading === "S")!;
    expect(s.sentences.every(u => u.text.length > 0 && u.text === u.text.trim())).toBe(true);
  });
  it("keeps a heading-only section with no sentences", () => {
    const a = parseArticle({ title: "T", revisionId: 1, wikitext: "== Empty ==" });
    const s = a.sections.find(x => x.heading === "Empty");
    expect(s).toBeDefined();
    expect(s!.sentences).toEqual([]);
  });
  it("carries through title and revisionId", () => {
    const a = parseArticle({ title: "Sea-based X-band radar", revisionId: 42, wikitext: "Lead." });
    expect(a.title).toBe("Sea-based X-band radar");
    expect(a.revisionId).toBe(42);
  });
});

// Gap 7 — parse.ts line 28: Array.isArray(rawSentences) ? rawSentences : [rawSentences]
// UNREACHABLE/SKIPPED: wtf_wikipedia's sentences() always returns an array in practice.
// The non-array branch is a purely defensive guard against the bundled TypeScript declaration
// typing sentences() as `object | object[]`. No combination of wikitext causes wtf to return
// a bare object here — faking it by mocking wtf would test mocked behavior (prohibited by
// testing policy), not real logic. This branch cannot be exercised without violating policy.
// Coverage gap accepted; defensive guard retained for type safety.
