// ABOUTME: Tests for safe-lane denylists + MediaWiki title canonicalizers (src/safelane/denylists.ts).
// ABOUTME: Canonicalization is safety-critical — a typo'd constant silently fail-OPENs the BLP floor.
import { describe, it, expect } from "vitest";
import {
  BLP_CATEGORIES,
  DISPUTE_TEMPLATES,
  canonicalizeCategoryTitle,
  canonicalizeTemplateName,
} from "../../src/safelane/denylists";

describe("canonicalizeCategoryTitle", () => {
  it("strips the Category: prefix, folds underscores, uppercases first letter only, trims, NFC", () => {
    expect(canonicalizeCategoryTitle("Category:Living people")).toBe("Living people");
    expect(canonicalizeCategoryTitle("category:living_people")).toBe("Living people");
    expect(canonicalizeCategoryTitle("  Living people  ")).toBe("Living people");
    // rest-of-title case is significant (MediaWiki rule): only the first letter is uppercased
    expect(canonicalizeCategoryTitle("living People")).toBe("Living People");
  });
  it("NFC-normalizes decomposed characters", () => {
    const decomposed = "Café people"; // e + combining acute
    expect(canonicalizeCategoryTitle(decomposed)).toBe("Café people".normalize("NFC"));
  });

  // Gap 5 — denylists.ts line 6: upperFirst("") returns "" (the s.length === 0 branch).
  // Reached when the entire title after stripping the prefix, folding, and trimming is empty.
  // "Category:" strips to "" → trim → "" → upperFirst("") → "".
  it("returns empty string for a prefix-only input (exercises the s.length === 0 branch in upperFirst)", () => {
    expect(canonicalizeCategoryTitle("Category:")).toBe("");
    expect(canonicalizeCategoryTitle("category:")).toBe("");
  });
});

describe("canonicalizeTemplateName", () => {
  it("strips Template: prefix, folds whitespace/underscores, first-letter upper", () => {
    expect(canonicalizeTemplateName("Template:POV")).toBe("POV");
    expect(canonicalizeTemplateName("template:pov")).toBe("POV".charAt(0) + "ov"); // "Pov"
  });
});

describe("denylist constants", () => {
  it("BLP set is canonical, non-empty, and within the clcategories 50-value ceiling", () => {
    expect(BLP_CATEGORIES.length).toBeGreaterThan(0);
    expect(BLP_CATEGORIES.length).toBeLessThanOrEqual(50); // R4-4 request ceiling
    for (const c of BLP_CATEGORIES) expect(canonicalizeCategoryTitle(c)).toBe(c); // already canonical
    expect(BLP_CATEGORIES).toContain("Living people");
  });
  it("dispute templates are canonical and non-empty", () => {
    expect(DISPUTE_TEMPLATES.length).toBeGreaterThan(0);
    for (const t of DISPUTE_TEMPLATES) expect(canonicalizeTemplateName(t)).toBe(t);
  });
});
