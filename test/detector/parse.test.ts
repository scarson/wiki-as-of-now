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
});
