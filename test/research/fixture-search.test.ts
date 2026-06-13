// ABOUTME: Tests the fixture-backed SearchProvider — returns recorded REAL URLs for test claims, no Brave key.
// ABOUTME: The committed fixture must hold real https pages; this lets the full fetch+verify+triage path run keyless.
import { describe, it, expect } from "vitest";
import { FixtureSearchProvider } from "../../src/research/fixture-search";

const FIXTURES = {
  "Zumwalt destroyer 2016 commissioning": [
    "https://www.navy.mil/Press-Office/zumwalt-commissioning",
    "https://en.wikipedia.org/wiki/USS_Zumwalt",
  ],
};

describe("FixtureSearchProvider", () => {
  it("returns the recorded real URLs for a known query (no network, no key)", async () => {
    const p = new FixtureSearchProvider(FIXTURES);
    const hits = await p.search("Zumwalt destroyer 2016 commissioning");
    expect(hits).toEqual([
      { url: "https://www.navy.mil/Press-Office/zumwalt-commissioning" },
      { url: "https://en.wikipedia.org/wiki/USS_Zumwalt" },
    ]);
  });
  it("returns [] for an unknown query rather than throwing", async () => {
    const p = new FixtureSearchProvider(FIXTURES);
    expect(await p.search("no such claim")).toEqual([]);
  });
  it("loads the committed fixture file by default when no map is passed", async () => {
    const p = new FixtureSearchProvider();
    // The committed file MUST contain at least one query mapping at least one https URL.
    const anyQuery = Object.keys(p.queries())[0];
    expect(anyQuery).toBeTruthy();
    const hits = await p.search(anyQuery);
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0].url).toMatch(/^https:\/\//);
  });
});
