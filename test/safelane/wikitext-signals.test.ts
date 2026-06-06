// ABOUTME: Tests for the deterministic advisory wikitext signal scan (src/safelane/wikitext-signals.ts).
// ABOUTME: Covers BLP-literal + dispute templates, comment/nowiki stripping, exclusions, and untrusted-input safety.
import { describe, it, expect } from "vitest";
import { scanWikitextSignals } from "../../src/safelane/wikitext-signals";

describe("scanWikitextSignals", () => {
  it("flags a literal BLP category", () => {
    expect(scanWikitextSignals("Foo.\n[[Category:Living people]]")).toContain("blp_wikitext");
  });
  it("flags dispute templates with whitespace/underscore/case tolerance", () => {
    expect(scanWikitextSignals("{{ POV }}\n{{disputed_inline}}")).toEqual(
      expect.arrayContaining(["dispute_template:POV", "dispute_template:Disputed inline"])
    );
  });
  it("ignores signals inside HTML comments and <nowiki>", () => {
    expect(scanWikitextSignals("<!-- [[Category:Living people]] -->")).toEqual([]);
    expect(scanWikitextSignals("<nowiki>{{POV}}</nowiki>")).toEqual([]);
  });
  it("does NOT do infobox-name matching (intentionally excluded — spec §4)", () => {
    expect(scanWikitextSignals("{{Infobox person|name=X}}")).toEqual([]);
  });
  it("returns [] for clean non-bio wikitext", () => {
    expect(scanWikitextSignals("The rover will launch in 2017. [[Category:Spacecraft]]")).toEqual([]);
  });
  it("emits dispute codes in sorted order and deduplicated", () => {
    expect(scanWikitextSignals("{{POV}} {{POV}} {{Current}}")).toEqual([
      "dispute_template:Current",
      "dispute_template:POV",
    ]);
  });
  it("is robust to malformed/unclosed markup on untrusted input (no catastrophic backtracking)", () => {
    // bounded length classes keep this linear; must return promptly with no match
    expect(scanWikitextSignals("{{" + "a".repeat(100000))).toEqual([]);
    expect(scanWikitextSignals("[[Category:" + "b".repeat(100000))).toEqual([]);
  });
});
