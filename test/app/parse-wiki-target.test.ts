// ABOUTME: Pure-function tests for parseWikiTarget — URL/title normalization, encoding, and rejection edges.
// ABOUTME: Shared by the capture form (client pre-validation) and the capture route (server authority).
import { describe, it, expect } from "vitest";
import { parseWikiTarget } from "../../src/app/queue/parse-wiki-target";

describe("parseWikiTarget", () => {
  it("accepts a bare title", () => {
    expect(parseWikiTarget("F-35 Lightning II")).toEqual({ ok: true, title: "F-35 Lightning II" });
  });
  it("trims surrounding whitespace from a bare title", () => {
    expect(parseWikiTarget("  Joint Strike Fighter  ")).toEqual({ ok: true, title: "Joint Strike Fighter" });
  });
  it("extracts + normalizes the title from a full /wiki/ URL", () => {
    expect(parseWikiTarget("https://en.wikipedia.org/wiki/Joint_Strike_Fighter")).toEqual({
      ok: true,
      title: "Joint Strike Fighter",
    });
  });
  it("decodes percent-encoding and strips fragment + query", () => {
    expect(parseWikiTarget("https://en.wikipedia.org/wiki/Caf%C3%A9_Procurement#History?x=1")).toEqual({
      ok: true,
      title: "Café Procurement",
    });
  });
  it("accepts other-language wikipedia subdomains", () => {
    expect(parseWikiTarget("https://de.wikipedia.org/wiki/Panzerhaubitze_2000")).toEqual({
      ok: true,
      title: "Panzerhaubitze 2000",
    });
  });
  it("rejects a non-Wikipedia URL", () => {
    const r = parseWikiTarget("https://example.com/wiki/Foo");
    expect(r.ok).toBe(false);
  });
  it("rejects a wikipedia URL that is not an article path", () => {
    const r = parseWikiTarget("https://en.wikipedia.org/w/index.php?title=Foo");
    expect(r.ok).toBe(false);
  });
  it("rejects empty / whitespace", () => {
    expect(parseWikiTarget("   ").ok).toBe(false);
  });
  it("rejects a malformed URL", () => {
    expect(parseWikiTarget("https://").ok).toBe(false);
  });
});
