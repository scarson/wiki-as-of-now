// ABOUTME: Smoke tests for the deterministic fake ResearchProvider helpers.
// ABOUTME: Verifies each fake returns the expected shape and that unavailableProvider rejects correctly.
import { describe, it, expect } from "vitest";
import {
  fakeProvider,
  unavailableProvider,
  floodProvider,
  sameHostProvider,
  subdomainFanoutProvider,
  malformedUrlProvider,
} from "./fake-providers";
import { ProviderUnavailableError } from "../../src/research/provider";

const CLAIM = { claimText: "x", sectionHeading: "S", year: 2020, sourceRevisionId: 1 };

describe("fakeProvider", () => {
  it("returns canned proposals with defaults", async () => {
    const proposals = [{ url: "https://a.com/", proposedQuote: "q", advisorySupport: true }];
    const r = await fakeProvider(proposals).research(CLAIM);
    expect(r.proposals).toEqual(proposals);
    expect(r.queries).toEqual([]);
    expect(r.providerName).toBe("fake");
    expect(r.modelVersion).toBe("fake-provider/0");
  });

  it("accepts overrides for queries, providerName, and modelVersion", async () => {
    const r = await fakeProvider([], { queries: ["q1"], providerName: "custom", modelVersion: "custom/1" }).research(CLAIM);
    expect(r.queries).toEqual(["q1"]);
    expect(r.providerName).toBe("custom");
    expect(r.modelVersion).toBe("custom/1");
  });
});

describe("unavailableProvider", () => {
  it("rejects with ProviderUnavailableError", async () => {
    await expect(unavailableProvider().research(CLAIM)).rejects.toBeInstanceOf(ProviderUnavailableError);
  });
});

describe("floodProvider", () => {
  it("emits exactly n proposals with distinct https URLs", async () => {
    const r = await floodProvider(5).research(CLAIM);
    expect(r.proposals).toHaveLength(5);
    const urls = r.proposals.map(p => p.url);
    expect(new Set(urls).size).toBe(5);
    for (const url of urls) {
      expect(url).toMatch(/^https:\/\//);
    }
  });

  it("handles n=10_000", async () => {
    const r = await floodProvider(10_000).research(CLAIM);
    expect(r.proposals).toHaveLength(10_000);
  });
});

describe("sameHostProvider", () => {
  it("emits n proposals all on the same canonical host", async () => {
    const r = await sameHostProvider(4).research(CLAIM);
    expect(r.proposals).toHaveLength(4);
    const hosts = r.proposals.map(p => new URL(p.url).host);
    expect(new Set(hosts).size).toBe(1);
  });
});

describe("subdomainFanoutProvider", () => {
  it("emits n proposals on distinct subdomains of the same registrable domain", async () => {
    const r = await subdomainFanoutProvider(3).research(CLAIM);
    expect(r.proposals).toHaveLength(3);
    const hosts = r.proposals.map(p => new URL(p.url).host);
    expect(new Set(hosts).size).toBe(3); // distinct hostnames
    for (const host of hosts) {
      expect(host).toMatch(/\.example\.com$/); // all share the registrable domain
    }
  });
});

describe("malformedUrlProvider", () => {
  it("emits a mix of valid and problematic URLs with the expected count", async () => {
    const r = await malformedUrlProvider().research(CLAIM);
    expect(r.proposals).toHaveLength(5);
    // first two are valid https
    expect(r.proposals[0].url).toMatch(/^https:\/\/valid\.example\.com\//);
    expect(r.proposals[1].url).toMatch(/^https:\/\/valid\.example\.com\//);
    // remaining are problematic
    expect(r.proposals[2].url).toBe("not a url");
    expect(r.proposals[3].url).toMatch(/^http:\/\//);
    expect(r.proposals[4].url).toMatch(/^https:\/\/127\.0\.0\.1\//);
  });
});
