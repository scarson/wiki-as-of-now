// ABOUTME: Unit tests for the Wikipedia URL helpers — current-article + section-anchor construction, encoding, edge cases.
import { describe, it, expect } from "vitest";
import { wikipediaArticleUrl, wikipediaSectionUrl } from "../../src/wikipedia/article-url";

describe("wikipediaArticleUrl", () => {
  it("builds a current-article URL with spaces as underscores", () => {
    expect(wikipediaArticleUrl("California High-Speed Rail")).toBe("https://en.wikipedia.org/wiki/California_High-Speed_Rail");
  });
  it("leaves a single-word title intact", () => {
    expect(wikipediaArticleUrl("Artemis")).toBe("https://en.wikipedia.org/wiki/Artemis");
  });
  it("percent-encodes characters that would break the URL but keeps _ - .", () => {
    expect(wikipediaArticleUrl("Foo & Bar")).toBe("https://en.wikipedia.org/wiki/Foo_%26_Bar");
  });
  it("keeps an ASCII apostrophe literal (encodeURIComponent does not encode it)", () => {
    expect(wikipediaArticleUrl("People's Republic")).toBe("https://en.wikipedia.org/wiki/People's_Republic");
  });
});

describe("wikipediaSectionUrl", () => {
  it("appends a section anchor with spaces as underscores", () => {
    expect(wikipediaSectionUrl("California High-Speed Rail", "Past cost estimates"))
      .toBe("https://en.wikipedia.org/wiki/California_High-Speed_Rail#Past_cost_estimates");
  });
  it("returns the bare article URL when the section is empty", () => {
    expect(wikipediaSectionUrl("Artemis", "")).toBe("https://en.wikipedia.org/wiki/Artemis");
  });
});
