// ABOUTME: Tests the manual-URL paste path helper — the "I already have a source URL" flow.
// ABOUTME: SearchHit carries only the url (no Brave snippet/title, ToS §3.2); de-dups + drops blanks.
import { describe, it, expect } from "vitest";
import { manualUrlsAsHits } from "../../src/research/search-provider";

describe("manualUrlsAsHits", () => {
  it("wraps each user-supplied URL as a SearchHit carrying only the url (no Brave snippet/title)", () => {
    expect(manualUrlsAsHits(["https://defense.gov/a", "https://gao.gov/b"])).toEqual([
      { url: "https://defense.gov/a" },
      { url: "https://gao.gov/b" },
    ]);
  });
  it("de-duplicates repeated URLs", () => {
    expect(manualUrlsAsHits(["https://x.gov/a", "https://x.gov/a"])).toEqual([{ url: "https://x.gov/a" }]);
  });
  it("drops blank/whitespace-only entries", () => {
    expect(manualUrlsAsHits(["https://x.gov/a", "  ", ""])).toEqual([{ url: "https://x.gov/a" }]);
  });
  it("returns [] for an empty list", () => {
    expect(manualUrlsAsHits([])).toEqual([]);
  });
});
