// ABOUTME: Tests the Brave search client — query → ranked REAL URLs, key in header, transport failure → ProviderUnavailableError.
// ABOUTME: Injected fetch fake (no live Brave call); asserts only url is retained (Brave title/snippet dropped per ToS §3.2).
import { describe, it, expect, vi } from "vitest";
import { BraveSearchProvider } from "../../src/research/brave-search";
import { ProviderUnavailableError } from "../../src/research/provider";

const braveBody = JSON.stringify({
  web: { results: [{ url: "https://defense.gov/a", title: "T" }, { url: "https://gao.gov/b", title: "U" }] },
});
const okResponse = () => ({ ok: true, status: 200, json: async () => JSON.parse(braveBody) });

describe("BraveSearchProvider", () => {
  it("sends the API key in the X-Subscription-Token header and the query in the q param", async () => {
    const fetchFn = vi.fn(async () => okResponse());
    const p = new BraveSearchProvider("test-key", fetchFn as never);
    await p.search("Zumwalt 2016");
    const [url, init] = fetchFn.mock.calls[0];
    expect(String(url)).toContain("q=Zumwalt+2016");
    expect((init as { headers: Record<string, string> }).headers["X-Subscription-Token"]).toBe("test-key");
  });
  it("maps Brave results to SearchHits carrying ONLY the url (drops title/description per ToS)", async () => {
    const p = new BraveSearchProvider("k", (async () => okResponse()) as never);
    expect(await p.search("q")).toEqual([{ url: "https://defense.gov/a" }, { url: "https://gao.gov/b" }]);
  });
  it("throws ProviderUnavailableError on a non-ok HTTP status", async () => {
    const fetchFn = vi.fn(async () => ({ ok: false, status: 429, json: async () => ({}) }));
    const p = new BraveSearchProvider("k", fetchFn as never);
    await expect(p.search("q")).rejects.toBeInstanceOf(ProviderUnavailableError);
  });
  it("throws ProviderUnavailableError when fetch rejects (transport failure)", async () => {
    const fetchFn = vi.fn(async () => { throw new Error("network down"); });
    const p = new BraveSearchProvider("k", fetchFn as never);
    await expect(p.search("q")).rejects.toBeInstanceOf(ProviderUnavailableError);
  });
  it("returns [] when Brave returns a body with no web.results", async () => {
    const fetchFn = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({}) }));
    const p = new BraveSearchProvider("k", fetchFn as never);
    expect(await p.search("q")).toEqual([]);
  });
});
