// ABOUTME: Tests buildRefWikitext — the mechanical wikitext <ref> built from source metadata (G2).
// ABOUTME: Verifies no model/quote/sentence text enters the citation and that template args are escaped.
import { describe, it, expect } from "vitest";
import { buildRefWikitext } from "../../src/worksheet/ref-assembler";

describe("buildRefWikitext", () => {
  it("builds a cite-web ref from url + title + publisher + dates", () => {
    const ref = buildRefWikitext({
      url: "https://example.gov/report-2024",
      title: "Annual Program Report 2024",
      publisher: "Defense Acquisition Office",
      publishedDate: "2024-03-01",
      accessedDate: "2026-06-13",
    });
    expect(ref).toContain("<ref>");
    expect(ref).toContain("</ref>");
    expect(ref).toContain("{{cite web");
    expect(ref).toContain("|url=https://example.gov/report-2024");
    expect(ref).toContain("|title=Annual Program Report 2024");
    expect(ref).toContain("|publisher=Defense Acquisition Office");
    expect(ref).toContain("|date=2024-03-01");
    expect(ref).toContain("|access-date=2026-06-13");
  });

  it("omits optional fields cleanly when absent (no empty |publisher=)", () => {
    const ref = buildRefWikitext({ url: "https://x.org/y", title: "Y", accessedDate: "2026-06-13" });
    expect(ref).not.toContain("|publisher=");
    expect(ref).not.toContain("|date=");
    expect(ref).toContain("|url=https://x.org/y");
    expect(ref).toContain("|access-date=2026-06-13");
  });

  it("escapes wikitext template metacharacters in the title to prevent arg/template injection", () => {
    const ref = buildRefWikitext({ url: "https://x.org/y", title: "A|B}}{{evil}}", accessedDate: "2026-06-13" });
    expect(ref).not.toContain("A|B}}{{evil}}");
    expect(ref).toContain("&#124;");   // pipe escaped so it can't open a new template arg
    expect(ref).toContain("&#125;&#125;"); // }} escaped so it can't close the cite
  });

  it("has no parameter that accepts article prose — the type forbids a 'sentence' or 'quote' field", () => {
    // @ts-expect-error — RefAssemblyInput has no 'sentence'/'quote' field by design (G1/G16)
    buildRefWikitext({ url: "https://x.org/y", title: "Y", accessedDate: "2026-06-13", sentence: "human prose" });
  });
});
