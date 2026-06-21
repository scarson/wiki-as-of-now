// ABOUTME: Tests the About/compliance content builder — human-authored constants from the contract, no machine prose (G1).
// ABOUTME: Verifies the public "will never do" commitments, named guardrails, canonical links, and a no-AI-import guard.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { aboutContent } from "../../src/about/compliance-content";

describe("aboutContent", () => {
  it("lists the 'will never do' commitments transcribed from the compliance contract", () => {
    const c = aboutContent();
    // These are the public commitments; they must appear verbatim from the contract's §5.
    expect(c.willNeverDo).toContain("Generate or rewrite article prose for pasting.");
    expect(c.willNeverDo).toContain("Auto-submit edits to Wikipedia.");
    // Contract §5 wording: "a citation that the human has not verified against the real source."
    expect(c.willNeverDo.some((x) => /citation that the human has not verified/i.test(x))).toBe(true);
    expect(c.willNeverDo.length).toBeGreaterThanOrEqual(8);
  });

  it("describes the named guardrails by name, not bare ids (contract's how-to-reference rule)", () => {
    const c = aboutContent();
    const names = c.guardrails.map((g) => g.name);
    expect(names).toContain("the no-machine-written-text guardrail");
    expect(names).toContain("human verification is a gated act of opening the source");
    expect(names).toContain("the tool shows its work");
    // Each entry carries a human name; the id is secondary, never the only reference.
    for (const g of c.guardrails) {
      expect(g.name.length).toBeGreaterThan(3);
      expect(g.name).not.toMatch(/^G\d+$/); // not a bare id as the name
      expect(g.summary.length).toBeGreaterThan(0);
    }
  });

  it("covers all sixteen named guardrails from the contract index", () => {
    const c = aboutContent();
    expect(c.guardrails).toHaveLength(16);
    const ids = c.guardrails.map((g) => g.id);
    for (let n = 1; n <= 16; n++) expect(ids).toContain(`G${n}`);
  });

  it("links the canonical contract and the open-source repo as the source of truth (no deep-copy)", () => {
    const c = aboutContent();
    expect(c.complianceContractPath).toBe("docs/policy/wikipedia-genai-compliance.md");
    expect(c.repoUrl).toMatch(/^https:\/\//);
    expect(c.abuseReportUrl).toMatch(/^https:\/\//);
  });

  it("provides a human-authored intro and a non-empty 'will do' list", () => {
    const c = aboutContent();
    expect(c.intro.length).toBeGreaterThan(0);
    expect(c.willDo.length).toBeGreaterThan(0);
  });

  it("contains no machine-generated prose: the module imports no AI/provider/fetch surface (G1)", () => {
    const src = readFileSync(new URL("../../src/about/compliance-content.ts", import.meta.url), "utf8");
    expect(src).not.toMatch(/env\.AI/);
    expect(src).not.toMatch(/research\/provider/);
    expect(src).not.toMatch(/\bfetch\s*\(/);
    expect(src).not.toMatch(/WorkersAiResearchProvider/);
  });
});
