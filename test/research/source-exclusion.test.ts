// ABOUTME: Tests circular-source exclusion — Wikipedia + mirrors/derivatives can't source Wikipedia (WP:CIRCULAR).
// ABOUTME: Bipolar: asserts the disallowed hosts are dropped AND that legitimate sources + look-alike domains pass.
import { describe, it, expect } from "vitest";
import { isCircularSource, filterCircularHits, excludeCircularSources } from "../../src/research/source-exclusion";
import type { SearchProvider, SearchHit } from "../../src/research/search-provider";

describe("isCircularSource", () => {
  it("excludes Wikipedia across languages and subdomains (case-insensitive)", () => {
    for (const h of ["wikipedia.org", "en.wikipedia.org", "de.wikipedia.org", "en.m.wikipedia.org", "EN.WIKIPEDIA.ORG"]) {
      expect(isCircularSource(h)).toBe(true);
    }
  });
  it("excludes known mirrors and Wikipedia-derived datasets", () => {
    for (const h of ["wikiwand.com", "www.wikiwand.com", "dbpedia.org", "wikidata.org", "commons.wikimedia.org"]) {
      expect(isCircularSource(h)).toBe(true);
    }
  });
  it("passes legitimate non-circular sources", () => {
    for (const h of ["www.britannica.com", "www.gao.gov", "nobelprize.org", "apnews.com"]) {
      expect(isCircularSource(h)).toBe(false);
    }
  });
  it("is suffix-safe: look-alike domains are NOT excluded", () => {
    // A leading label without a dot boundary, and a domain that merely embeds the name as a prefix.
    for (const h of ["notwikipedia.org", "wikipedia.org.attacker.com", "mywikipedia.org", "fakewikidata.org"]) {
      expect(isCircularSource(h)).toBe(false);
    }
  });
  it("returns false for an empty/dot host", () => {
    expect(isCircularSource("")).toBe(false);
    expect(isCircularSource(".")).toBe(false);
  });
});

describe("filterCircularHits", () => {
  it("drops circular hits, keeps legitimate ones, preserves order", () => {
    const hits: SearchHit[] = [
      { url: "https://en.wikipedia.org/wiki/Canberra" },
      { url: "https://www.britannica.com/place/Canberra" },
      { url: "https://www.wikiwand.com/en/Canberra" },
      { url: "https://www.nationalcapital.gov.au/" },
    ];
    expect(filterCircularHits(hits)).toEqual([
      { url: "https://www.britannica.com/place/Canberra" },
      { url: "https://www.nationalcapital.gov.au/" },
    ]);
  });
  it("passes an unparseable URL through (URL validity is the fetch/canonicalize step's job, not this filter's)", () => {
    const hits: SearchHit[] = [{ url: "not a url" }, { url: "https://en.wikipedia.org/wiki/X" }];
    expect(filterCircularHits(hits)).toEqual([{ url: "not a url" }]);
  });
});

describe("excludeCircularSources", () => {
  it("wraps a provider so circular sources never reach the caller, forwarding the query unchanged", async () => {
    let seenQuery = "";
    const inner: SearchProvider = {
      search: async (q) => { seenQuery = q; return [{ url: "https://de.wikipedia.org/wiki/X" }, { url: "https://apnews.com/article/y" }]; },
    };
    const wrapped = excludeCircularSources(inner);
    const out = await wrapped.search("neutral query");
    expect(seenQuery).toBe("neutral query");
    expect(out).toEqual([{ url: "https://apnews.com/article/y" }]);
  });
});
