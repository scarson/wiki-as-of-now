// ABOUTME: Tests buildDisclosureSummary — the two-part mechanical edit summary (G12).
// ABOUTME: Disclosure part names the AI model+version from the log; both parts are template fills, never authored.
import { describe, it, expect } from "vitest";
import { buildDisclosureSummary } from "../../src/worksheet/disclosure";

describe("buildDisclosureSummary", () => {
  it("fills the disclosure part with the model name and version verbatim from the log", () => {
    const s = buildDisclosureSummary({ modelVersion: "@cf/google/gemma-4-26b-a4b-it", sectionHeading: "Development", refCount: 1 });
    expect(s.disclosure).toContain("@cf/google/gemma-4-26b-a4b-it");
    expect(s.disclosure.toLowerCase()).toContain("ai-assisted");
  });

  it("fills the change-description from structured selections (section + ref count), pluralized", () => {
    const one = buildDisclosureSummary({ modelVersion: "m/1", sectionHeading: "Development", refCount: 1 });
    expect(one.changeDescription).toContain("Development");
    expect(one.changeDescription).toContain("1 reference");
    const many = buildDisclosureSummary({ modelVersion: "m/1", sectionHeading: "History", refCount: 3 });
    expect(many.changeDescription).toContain("3 references");
  });

  it("combines into a single paste-ready summary string", () => {
    const s = buildDisclosureSummary({ modelVersion: "m/1", sectionHeading: "Development", refCount: 1 });
    expect(s.combined).toBe(`${s.changeDescription} ${s.disclosure}`);
  });

  it("falls back to a present-but-honest model label when modelVersion is null (no pack / fake provider)", () => {
    const s = buildDisclosureSummary({ modelVersion: null, sectionHeading: "Development", refCount: 1 });
    // Must still disclose AI assistance; must NOT invent a model name.
    expect(s.disclosure.toLowerCase()).toContain("ai-assisted");
    expect(s.disclosure).toContain("unspecified");
  });
});
