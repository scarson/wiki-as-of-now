// ABOUTME: Fixture-backed tests for the Pageviews client + pure window/ranking helpers (injected clock, no network).
// ABOUTME: Window math is deterministic in `now`; ranking is DESC by count with a stable title tiebreak.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fetchPageviewCount, pageviewWindow, rankByPageviews } from "../../src/ingest/pageviews";

const ALPHA = JSON.parse(readFileSync("test/fixtures/pageviews/alpha-30d.json", "utf8"));

describe("pageviewWindow", () => {
  it("returns the trailing 30 complete days ending ~2 days before now (lag buffer)", () => {
    const now = new Date("2026-06-13T12:00:00.000Z");
    const w = pageviewWindow(now);
    expect(w.end).toBe("2026-06-11"); // now - 2 days (data lag buffer)
    expect(w.start).toBe("2026-05-13"); // end - 29 days inclusive = 30-day window
  });
  it("is deterministic across time-of-day (injected clock)", () => {
    expect(pageviewWindow(new Date("2026-06-13T23:59:59Z")).end).toBe(
      pageviewWindow(new Date("2026-06-13T00:00:01Z")).end
    );
  });
});

describe("fetchPageviewCount", () => {
  it("sums daily views over the window", async () => {
    const total = (ALPHA.items as { views: number }[]).reduce((s, i) => s + i.views, 0);
    const got = await fetchPageviewCount(
      "Military acquisition",
      { start: "2026-05-13", end: "2026-06-11" },
      { fetchFn: async () => ({ ok: true, status: 200, json: async () => ALPHA }) }
    );
    expect(got).toBe(total);
  });
  it("a 404 (never-viewed article) yields count 0, not a throw", async () => {
    const got = await fetchPageviewCount(
      "Obscure",
      { start: "2026-05-13", end: "2026-06-11" },
      {
        fetchFn: async () => ({
          ok: false,
          status: 404,
          json: async () => ({ type: "https://...", title: "Not found" }),
        }),
      }
    );
    expect(got).toBe(0);
  });
  it("encodes spaces and unicode in the title (URL boundary)", async () => {
    let calledUrl = "";
    await fetchPageviewCount(
      "Café Procurement",
      { start: "2026-05-13", end: "2026-06-11" },
      {
        fetchFn: async (url: string) => {
          calledUrl = url;
          return { ok: true, status: 200, json: async () => ({ items: [] }) };
        },
      }
    );
    // space → underscore → percent-encoded; é percent-encoded; dates stripped of dashes.
    expect(calledUrl).toContain("Caf%C3%A9_Procurement");
    expect(calledUrl).toContain("/daily/20260513/20260611");
  });
});

describe("rankByPageviews", () => {
  it("ranks by count DESC, 1-based, with a stable title tiebreak", () => {
    const ranked = rankByPageviews([
      { pageId: 2, title: "Beta", pageviewCount: 4000 },
      { pageId: 1, title: "Alpha", pageviewCount: 9000 },
      { pageId: 3, title: "Gamma", pageviewCount: 4000 },
    ]);
    expect(ranked.map((r) => [r.rank, r.title])).toEqual([
      [1, "Alpha"],
      [2, "Beta"],
      [3, "Gamma"],
    ]);
  });
  it("empty input yields empty ranking", () => {
    expect(rankByPageviews([])).toEqual([]);
  });
});
