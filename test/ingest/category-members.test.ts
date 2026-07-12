// ABOUTME: Fixture-backed tests for the MediaWiki categorymembers client — mainspace filtering, empty, maxlag.
// ABOUTME: Uses a committed REAL response (no live network at test time, testing-pitfalls §9).
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fetchCategoryMembers } from "../../src/ingest/category-members";

const FIXTURE = JSON.parse(
  readFileSync("test/fixtures/category-members/military-procurement-sample.json", "utf8")
);

function stubFetch(body: unknown, status = 200, ok = true) {
  return async () => ({ ok, status, json: async () => body });
}

describe("fetchCategoryMembers", () => {
  it("returns mainspace (ns=0) article titles + pageids from a category", async () => {
    const members = await fetchCategoryMembers("Category:Military_acquisition", {
      fetchFn: stubFetch(FIXTURE),
    });
    expect(members.length).toBeGreaterThan(0);
    expect(members.every((m) => typeof m.title === "string" && typeof m.pageId === "number")).toBe(true);
    expect(members[0]).toEqual({ pageId: 22024319, title: "Military acquisition" });
  });

  it("filters out non-mainspace members (ns != 0)", async () => {
    const mixed = {
      query: {
        categorymembers: [
          { pageid: 1, ns: 0, title: "Real Article" },
          { pageid: 2, ns: 14, title: "Category:Subcat" },
          { pageid: 3, ns: 4, title: "Wikipedia:Project" },
        ],
      },
    };
    const members = await fetchCategoryMembers("Category:X", { fetchFn: stubFetch(mixed) });
    expect(members).toEqual([{ pageId: 1, title: "Real Article" }]);
  });

  it("empty category yields an empty list, not a throw", async () => {
    const members = await fetchCategoryMembers("Category:Empty", {
      fetchFn: stubFetch({ query: { categorymembers: [] } }),
    });
    expect(members).toEqual([]);
  });

  it("a maxlag error maps to WikimediaUnavailableError", async () => {
    const { WikimediaUnavailableError } = await import("../../src/ingest/wikimedia");
    await expect(
      fetchCategoryMembers("Category:X", {
        fetchFn: stubFetch({ error: { code: "maxlag", info: "lag" } }),
      })
    ).rejects.toBeInstanceOf(WikimediaUnavailableError);
  });

  it("a non-maxlag API error maps to WikimediaResponseError", async () => {
    const { WikimediaResponseError } = await import("../../src/ingest/wikimedia");
    await expect(
      fetchCategoryMembers("Category:X", {
        fetchFn: stubFetch({ error: { code: "badparam", info: "nope" } }),
      })
    ).rejects.toBeInstanceOf(WikimediaResponseError);
  });

  it("a non-JSON body maps to WikimediaResponseError", async () => {
    const { WikimediaResponseError } = await import("../../src/ingest/wikimedia");
    const badJson = async () => ({
      ok: true,
      status: 200,
      json: async () => {
        throw new Error("not json");
      },
    });
    await expect(
      fetchCategoryMembers("Category:X", { fetchFn: badJson })
    ).rejects.toBeInstanceOf(WikimediaResponseError);
  });
});
